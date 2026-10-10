import React from 'react';

/**
 * The picture an empty notification list stands on.
 *
 * A greyed-out crossed bell says 「notifications are off」, which is not what is
 * being reported — nothing has happened yet, and that is ordinary. The bell
 * here is upright and the colour of the app, with a message on its way to it:
 * the state is 「waiting」, not 「disabled」.
 */
const NotificationBellArt: React.FC = () => (
  <svg
    width="168"
    height="120"
    viewBox="0 0 168 120"
    fill="none"
    role="img"
    aria-label="還沒有通知"
    data-testid="notifications-empty-art"
  >
    {/* The halo the bell sits in. */}
    <circle cx="80" cy="62" r="34" fill="#efeafe" />

    {/* A message already on its way. */}
    <rect x="104" y="18" width="46" height="30" rx="12" fill="#c9bffb" />
    <path d="M118 48 L118 56 L128 48 Z" fill="#c9bffb" />
    <circle cx="117" cy="33" r="3" fill="#ffffff" />
    <circle cx="127" cy="33" r="3" fill="#ffffff" />
    <circle cx="137" cy="33" r="3" fill="#ffffff" />

    {/* The bell. */}
    <path
      d="M80 36c-10 0-17 7.6-17 17v10.5c0 3.2-1.2 6.2-3.4 8.5l-1.6 1.7c-1.6 1.7-.4 4.5 1.9 4.5h40.2c2.3 0 3.5-2.8 1.9-4.5l-1.6-1.7a12.3 12.3 0 0 1-3.4-8.5V53c0-9.4-7-17-17-17Z"
      fill="#7c3aed"
    />
    <path d="M80 30.5a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z" fill="#7c3aed" />
    <path
      d="M72.6 82.5a7.6 7.6 0 0 0 14.8 0Z"
      fill="#5b21b6"
    />

    {/* Ring lines. */}
    <path d="M55 33 L50 27" stroke="#8b5cf6" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M48 46 L41 44" stroke="#8b5cf6" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M62 25 L60 18" stroke="#8b5cf6" strokeWidth="3.2" strokeLinecap="round" />

    {/* Clouds, for the travelling it is all about. */}
    <path
      d="M22 66c0-4.4 3.6-8 8-8 1 0 2 .2 2.9.6A7 7 0 0 1 46 61.5a6 6 0 0 1-.8 11.9H30c-4.4 0-8-3.5-8-7.4Z"
      fill="#dfe7fb"
    />
    <path
      d="M112 82a6.3 6.3 0 0 1 6.3-6.3c.8 0 1.6.2 2.3.5a5.5 5.5 0 0 1 9.6 2.3 4.7 4.7 0 0 1-.6 9.3h-11.3a6.3 6.3 0 0 1-6.3-5.8Z"
      fill="#dfe7fb"
    />

    {/* A paper plane leaving. */}
    <path d="M128 60 L152 50 L142 74 L137 65 Z" fill="#8b5cf6" />
    <path d="M137 65 L152 50 L140 68 Z" fill="#6d28d9" />

    {/* Dotted route. */}
    <path
      d="M100 92c10 6 22 4 30-4"
      stroke="#c9bffb"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeDasharray="1 7"
    />
  </svg>
);

export default NotificationBellArt;
