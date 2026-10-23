// The words around the site that can be handwritten, for the studio's
// checklist. Anything wrapped in <Hand> works whether or not it's listed here;
// listing it just puts it on the to-do list. Same text, same drawing (case
// doesn't matter), unless an entry is { text, name }: then <Hand name="…">
// uses that drawing, e.g. a small lowercase "sent" apart from the "Sent" heading.
// The write page's buttons stay in type, so writing tools are always clear.
export const HAND_LABELS = [
  // header
  'penpals',
  'scripters',
  'write',
  'mailbox',
  'log out',
  // home
  'Letters,',
  'by hand.',
  'Every letter is handwritten.',
  'Only the ink travels.',
  'Scripters',
  { text: 'sent', name: 'sent-count' },
  { text: 'kept', name: 'kept-count' },
  'Top letters',
  // write, and every letter
  'Your letter',
  'Watch',
  'Stop',
  // mailbox
  'Mailbox',
  'For you',
  'Sent',
  'Open',
  'Read again',
  'Close',
  'No letters waiting.',
  'Nothing sent yet.',
  'Keep on my profile',
  // profile
  'Your signature',
  'Letters on this profile',
  'Nothing here yet.',
  'Sign again',
  'Save signature',
  'Remove',
  'Cancel',
  'Make private',
  'Make public',
  'Remove from my profile',
  // someone else's profile
  'Add friend',
  'Cancel friend request',
  'Accept friend request',
  'Decline',
  'Unfriend',
  'Block',
  'Unblock',
  // footer
  'Writing speed',
  // your profile's settings
  'Colours',
  'Auto',
  'Dark',
  'Light',
  // digits: every count on the site is written from these
  ...'0123456789'.split('').map((d) => ({ text: d, name: `digit-${d}` })),
];
