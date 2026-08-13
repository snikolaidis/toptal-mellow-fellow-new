export interface AnnouncementItem {
  label?: string | null;
  labelColor?: string | null;
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
    labelColor: '#312E81',
    link: null,
    icon: { node: { sourceUrl: '/lab-tested-icon.svg', altText: '' } },
  },
  {
    label: 'Award-Winning Blends',
    labelColor: '#78350F',
    link: null,
    icon: { node: { sourceUrl: '/award-winning-blends-icon.svg', altText: '' } },
  },
  {
    label: 'Free Ship $80+',
    labelColor: '#064E3B',
    link: null,
    icon: { node: { sourceUrl: '/free-ship-icon.svg', altText: '' } },
  },
  {
    label: '5M+ Satisfied Customers',
    labelColor: '#881337',
    link: null,
    icon: { node: { sourceUrl: '/satisfied-customers-icon.svg', altText: '' } },
  },
];
