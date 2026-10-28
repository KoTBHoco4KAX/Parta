import type { SVGProps } from 'react';

/** Локальные stroke-иконки админки: без внешних зависимостей. */

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

export function IconPlus(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 4.5v15m7.5-7.5h-15" />
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

export function IconAlert(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
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

export function IconLock(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
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

export function IconSparkles(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
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

export function IconUsers(props: IconProps) {
  return (
    <svg {...defaults} {...props}>
      <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}
