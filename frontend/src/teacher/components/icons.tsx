import type { SVGProps } from 'react';

/**
 * Минимальный набор stroke-иконок, чтобы не тянуть lucide-react
 * (новые зависимости без согласования запрещены — PROJECT_MANIFEST §3.1).
 */

export type IconProps = SVGProps<SVGSVGElement>;

const defaults = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export function IconInbox(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a3 3 0 0 0 3 3h13.5a3 3 0 0 0 3-3v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a3 3 0 0 0-2.87-2.088H7.63a3 3 0 0 0-2.87 2.088L2.1 12.839a2.25 2.25 0 0 0-.1.661Z" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export function IconFile(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M16.023 9.348h4.992V4.356m-4.992 4.992v-4.99m0 4.99H11.03M2.985 19.644v-4.992m0 4.992h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

export function IconPaperclip(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M3 20.25h18M6.75 20.25V12m5.25 8.25V6.75m5.25 13.5v-5.25" />
    </svg>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M9 3.75h6a1.5 1.5 0 0 1 1.5 1.5v.75h1.5A2.25 2.25 0 0 1 20.25 8.25v10.5A2.25 2.25 0 0 1 18 21H6a2.25 2.25 0 0 1-2.25-2.25V8.25A2.25 2.25 0 0 1 6 6h1.5v-.75a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M9 3.75v2.25h6V3.75M8.25 12h7.5m-7.5 4.5h4.5" />
    </svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m13.5 3-9 10.5h6l-1.5 7.5 9-10.5h-6l1.5-7.5Z" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5A2.25 2.25 0 0 1 5.25 5.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75Zm0-6.75h18" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m21 21-4.35-4.35M17.25 10.5a6.75 6.75 0 1 1-13.5 0 6.75 6.75 0 0 1 13.5 0Z" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m4.5 8.25 7.5 7.5 7.5-7.5" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m15.75 4.5-7.5 7.5 7.5 7.5" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M4.5 12h15m0 0-6-6m6 6-6 6" />
    </svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M6 12 3.27 3.18a.75.75 0 0 1 1.01-.9l16.1 7.9a.75.75 0 0 1 0 1.34l-16.1 7.9a.75.75 0 0 1-1.01-.9L6 12Zm0 0h6.75" />
    </svg>
  );
}

export function IconGift(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 21V7.5m0 0H8.25a2.25 2.25 0 1 1 0-4.5C11.25 3 12 7.5 12 7.5Zm0 0h3.75a2.25 2.25 0 1 0 0-4.5C12.75 3 12 7.5 12 7.5Zm-9 3.75h18" />
    </svg>
  );
}

export function IconTrend(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M2.25 18 9 11.25l4.306 4.307a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
    </svg>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6h3m3.75 12h9.75m-9.75 0a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 18h3m9.75-6h3.75m-3.75 0a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 12h9.75" />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

export function IconFlag(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M3 3v18m0-13.5h13.5l-2.25 4.5 2.25 4.5H3" />
    </svg>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m12 2.25 8.25 4.5L12 11.25 3.75 6.75 12 2.25ZM3.75 12 12 16.5l8.25-4.5M3.75 17.25 12 21.75l8.25-4.5" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21.75H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}
