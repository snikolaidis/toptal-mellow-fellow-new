export interface AnnouncementItem {
  label?: string | null;
  showOnMobile?: boolean | null;
  link?: { url?: string | null } | null;
  icon?: {
    node?: {
      sourceUrl?: string | null;
      altText?: string | null;
    } | null;
  } | null;
}

export const ANNOUNCEMENT_ITEMS: AnnouncementItem[] = [
  {
    label: 'Lab-Tested',
    showOnMobile: true,
    link: null,
    icon: { node: { sourceUrl: '/lab-tested-icon.svg', altText: '' } },
  },
  {
    label: 'Award-Winning Blends',
    showOnMobile: true,
    link: null,
    icon: { node: { sourceUrl: '/award-winning-blends-icon.svg', altText: '' } },
  },
  {
    label: 'Free Ship $80+',
    showOnMobile: true,
    link: null,
    icon: { node: { sourceUrl: '/free-ship-icon.svg', altText: '' } },
  },
  {
    label: '5M+ Satisfied Customers',
    showOnMobile: false,
    link: null,
    icon: { node: { sourceUrl: '/satisfied-customers-icon.svg', altText: '' } },
  },
];
