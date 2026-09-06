import {
  Settings,
  LogOut,
  UserPlus,
  Lock,
  UserCog,
  UserMinus,
  Mail,
  CheckCircle,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { ActivityType } from '@/lib/db/schema';
import { getActivityLogs } from '@/lib/db/queries';
import { GxEmpty } from '@/components/gx/gx-badge-empty';
import { GxPage, GxPageHeader, GxSection } from '@/components/gx/gx-page';

const iconMap: Record<ActivityType, LucideIcon> = {
  [ActivityType.SIGN_UP]: UserPlus,
  [ActivityType.SIGN_IN]: UserCog,
  [ActivityType.SIGN_OUT]: LogOut,
  [ActivityType.UPDATE_PASSWORD]: Lock,
  [ActivityType.DELETE_ACCOUNT]: UserMinus,
  [ActivityType.UPDATE_ACCOUNT]: Settings,
  [ActivityType.CREATE_TENANT]: UserPlus,
  [ActivityType.REMOVE_TENANT_MEMBER]: UserMinus,
  [ActivityType.INVITE_TENANT_MEMBER]: Mail,
  [ActivityType.ACCEPT_INVITATION]: CheckCircle,
};

const LIBELLE: Record<ActivityType, string> = {
  [ActivityType.SIGN_UP]: 'Inscription',
  [ActivityType.SIGN_IN]: 'Connexion',
  [ActivityType.SIGN_OUT]: 'Déconnexion',
  [ActivityType.UPDATE_PASSWORD]: 'Mot de passe modifié',
  [ActivityType.DELETE_ACCOUNT]: 'Compte supprimé',
  [ActivityType.UPDATE_ACCOUNT]: 'Compte mis à jour',
  [ActivityType.CREATE_TENANT]: 'Espace créé',
  [ActivityType.REMOVE_TENANT_MEMBER]: 'Membre retiré',
  [ActivityType.INVITE_TENANT_MEMBER]: 'Membre invité',
  [ActivityType.ACCEPT_INVITATION]: 'Invitation acceptée',
};

function tempsRelatif(date: Date) {
  const secondes = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secondes < 60) return "à l'instant";
  if (secondes < 3600) return `il y a ${Math.floor(secondes / 60)} min`;
  if (secondes < 86400) return `il y a ${Math.floor(secondes / 3600)} h`;
  if (secondes < 604800) return `il y a ${Math.floor(secondes / 86400)} j`;
  return date.toLocaleDateString('fr-FR');
}

export default async function ActivityPage() {
  const logs = await getActivityLogs();

  return (
    <GxPage className="max-w-3xl">
      <GxPageHeader
        eyebrow="Compte"
        titre="Activité récente"
        intro="Les connexions et modifications faites sur ce compte, les plus récentes en premier."
      />

      <GxSection titre="Dernières actions">
        {logs.length > 0 ? (
          <ol className="divide-y divide-line">
            {logs.map((log) => {
              const Icon = iconMap[log.action as ActivityType] ?? Settings;
              return (
                <li key={log.id} className="flex items-center gap-4 py-3 first:pt-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-ink text-info">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {LIBELLE[log.action as ActivityType] ?? 'Action inconnue'}
                    </p>
                    <p className="t-data mt-0.5 text-xs text-paper-3">
                      {tempsRelatif(new Date(log.timestamp))}
                      {log.ipAddress && ` · IP ${log.ipAddress}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <GxEmpty
            icon={<Activity aria-hidden="true" />}
            title="Rien à afficher"
            hint="Vos connexions et modifications de compte apparaîtront ici dès la prochaine action."
          />
        )}
      </GxSection>
    </GxPage>
  );
}
