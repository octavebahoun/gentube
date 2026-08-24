'use server';

import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import {
  ActivityType,
  activityLogs,
  invitations,
  tenants,
  users,
  type User,
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
import { getUser } from '@/lib/db/queries';
import { grantCredits, PLAN_MONTHLY_CREDITS } from '@/lib/credits';
import {
  validatedAction,
  validatedActionWithUser,
} from '@/lib/auth/middleware';

async function logActivity(
  tenantId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string
) {
  if (tenantId === null || tenantId === undefined) {
    return;
  }
  await tenantDb(tenantId).insert(activityLogs, {
    userId,
    action: type,
    ipAddress: ipAddress || '',
  });
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signIn = validatedAction(signInSchema, async (data) => {
  const { email, password } = data;

  // Pre-authentication lookup: the tenant is not known until the credentials
  // check out, so this one query is keyed on the unique email instead.
  const [foundUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (!foundUser) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password,
    };
  }

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password,
    };
  }

  await Promise.all([
    setSession(foundUser),
    logActivity(foundUser.tenantId, foundUser.id, ActivityType.SIGN_IN),
  ]);

  redirect('/dashboard');
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional(),
});

export const signUp = validatedAction(signUpSchema, async (data) => {
  const { email, password, inviteId } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: 'Failed to create user. Please try again.',
      email,
      password,
    };
  }

  const passwordHash = await hashPassword(password);

  // Tenant bootstrap: joining an existing tenant through an invitation, or
  // creating a brand new one. Both branches run unscoped by necessity — the
  // caller has no tenant yet — and both end by handing off to tenantDb().
  let createdUser: User;
  let tenantId: number;
  let joinedExistingTenant = false;

  if (inviteId) {
    const parsedInviteId = Number.parseInt(inviteId, 10);
    if (Number.isNaN(parsedInviteId)) {
      return { error: 'Invalid or expired invitation.', email, password };
    }

    // Keyed on the invitation id *and* the invited email, so an invitation
    // cannot be redeemed by anyone else.
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, parsedInviteId),
          eq(invitations.email, email),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    if (!invitation) {
      return { error: 'Invalid or expired invitation.', email, password };
    }

    tenantId = invitation.tenantId;
    joinedExistingTenant = true;

    [createdUser] = await db.transaction(async (tx) => {
      await tx
        .update(invitations)
        .set({ status: 'accepted' })
        .where(eq(invitations.id, invitation.id));

      return await tx
        .insert(users)
        .values({
          tenantId: invitation.tenantId,
          email,
          passwordHash,
          role: invitation.role,
        })
        .returning();
    });
  } else {
    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: `${email}'s workspace`, plan: 'starter' })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email,
          passwordHash,
          role: 'owner',
        })
        .returning();

      return { tenant, user };
    });

    tenantId = result.tenant.id;
    createdUser = result.user;

    // Starter allowance, booked through the ledger like any other movement.
    await grantCredits(tenantDb(tenantId), {
      amount: PLAN_MONTHLY_CREDITS.starter,
      reason: 'signup_grant',
      idempotencyKey: `tenant:${tenantId}:signup_grant`,
    });

    await logActivity(tenantId, createdUser.id, ActivityType.CREATE_TENANT);
  }

  if (!createdUser) {
    return {
      error: 'Failed to create user. Please try again.',
      email,
      password,
    };
  }

  if (joinedExistingTenant) {
    await logActivity(
      tenantId,
      createdUser.id,
      ActivityType.ACCEPT_INVITATION
    );
  }

  await Promise.all([
    logActivity(tenantId, createdUser.id, ActivityType.SIGN_UP),
    setSession(createdUser),
  ]);

  redirect('/dashboard');
});

export async function signOut() {
  const user = (await getUser()) as User;
  if (user) {
    await logActivity(user.tenantId, user.id, ActivityType.SIGN_OUT);
  }
  (await cookies()).delete('session');
}

const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(100),
    newPassword: z.string().min(8).max(100),
    confirmPassword: z.string().min(8).max(100),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation password do not match.',
    path: ['confirmPassword'],
  });

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Current password is incorrect.',
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password must be different from the current password.',
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const tdb = tenantDb(user.tenantId);

    await Promise.all([
      tdb.update(
        users,
        { passwordHash: newPasswordHash, updatedAt: new Date() },
        eq(users.id, user.id)
      ),
      logActivity(user.tenantId, user.id, ActivityType.UPDATE_PASSWORD),
    ]);

    return { success: 'Password updated successfully.' };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'Incorrect password. Account deletion failed.',
      };
    }

    await logActivity(user.tenantId, user.id, ActivityType.DELETE_ACCOUNT);

    // Soft delete, with the email freed up for re-registration.
    await tenantDb(user.tenantId).update(
      users,
      {
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')`,
      },
      eq(users.id, user.id)
    );

    (await cookies()).delete('session');
    redirect('/sign-in');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const tdb = tenantDb(user.tenantId);

    await Promise.all([
      tdb.update(users, { name, email, updatedAt: new Date() }, eq(users.id, user.id)),
      logActivity(user.tenantId, user.id, ActivityType.UPDATE_ACCOUNT),
    ]);

    return { name, success: 'Account updated successfully.' };
  }
);

const removeTenantMemberSchema = z.object({
  memberId: z.number(),
});

export const removeTenantMember = validatedActionWithUser(
  removeTenantMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;

    if (memberId === user.id) {
      return { error: 'You cannot remove yourself from the workspace.' };
    }
    if (user.role === 'member') {
      return { error: 'Only an owner or admin can remove a member.' };
    }

    // tenantDb scopes the update, so a member id from another tenant matches
    // nothing rather than deleting someone else's user.
    const removed = await tenantDb(user.tenantId).update(
      users,
      {
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-removed')`,
      },
      and(eq(users.id, memberId), isNull(users.deletedAt))!
    );

    if (removed.length === 0) {
      return { error: 'Member not found in this workspace.' };
    }

    await logActivity(
      user.tenantId,
      user.id,
      ActivityType.REMOVE_TENANT_MEMBER
    );

    return { success: 'Member removed successfully' };
  }
);

const inviteTenantMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['member', 'admin', 'owner']),
});

export const inviteTenantMember = validatedActionWithUser(
  inviteTenantMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;

    if (user.role === 'member') {
      return { error: 'Only an owner or admin can invite members.' };
    }

    const tdb = tenantDb(user.tenantId);

    const existingMember = await tdb.findFirst(
      users,
      and(eq(users.email, email), isNull(users.deletedAt))!
    );
    if (existingMember) {
      return { error: 'User is already a member of this workspace' };
    }

    const existingInvitation = await tdb.findFirst(
      invitations,
      and(eq(invitations.email, email), eq(invitations.status, 'pending'))!
    );
    if (existingInvitation) {
      return { error: 'An invitation has already been sent to this email' };
    }

    await tdb.insert(invitations, {
      email,
      role,
      invitedBy: user.id,
      status: 'pending',
    });

    await logActivity(
      user.tenantId,
      user.id,
      ActivityType.INVITE_TENANT_MEMBER
    );

    // TODO: Send invitation email and include ?inviteId={id} in the sign-up URL
    return { success: 'Invitation sent successfully' };
  }
);
