// Demo content used until a real database is connected.
// createSeedData() returns a fresh copy each time so "Reset demo data" works.
window.createSeedData = function () {
  const now = Date.now();
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;

  return {
    version: 1,
    users: {
      me: { id: 'me', name: 'New Member', handle: 'member', bio: 'Just joined. Say hello!', color: '#9a6b1f' },
      james: { id: 'james', name: 'James Whitaker', handle: 'jwhitaker', bio: 'Tailoring nerd. Coffee first.', color: '#2f6f8f' },
      marcus: { id: 'marcus', name: 'Marcus Bell', handle: 'mbell', bio: 'Lifting, cooking, and bad puns.', color: '#5b7f3a' },
      theo: { id: 'theo', name: 'Theo Grant', handle: 'theog', bio: 'Product designer. Weekend woodworker.', color: '#8a4b8f' },
      sam: { id: 'sam', name: 'Sam Ortiz', handle: 'samo', bio: 'Always planning the next road trip.', color: '#b4492f' }
    },
    posts: [
      {
        id: 'p1', authorId: 'james', createdAt: now - 25 * min,
        text: 'Finally had my old leather boots resoled instead of replacing them. Feels like a brand new pair for a third of the price.',
        likes: ['marcus', 'theo'],
        comments: [
          { id: 'c1', authorId: 'marcus', text: 'Good cobblers are worth their weight in gold.', createdAt: now - 18 * min }
        ]
      },
      {
        id: 'p2', authorId: 'marcus', createdAt: now - 3 * hr,
        text: 'New PR on deadlift this morning: 405 lbs. Six months of consistent training paying off.\n\nRest days matter, fellas.',
        likes: ['james', 'sam', 'theo'],
        comments: [
          { id: 'c2', authorId: 'sam', text: 'Huge! What program are you running?', createdAt: now - 2 * hr },
          { id: 'c3', authorId: 'marcus', text: '5/3/1 with a few tweaks. Happy to share in the forum.', createdAt: now - 90 * min }
        ]
      },
      {
        id: 'p3', authorId: 'theo', createdAt: now - 20 * hr,
        text: 'Built a walnut side table this weekend. First time doing proper dovetail joints, and they are not perfect, but they hold.',
        likes: ['james'],
        comments: []
      },
      {
        id: 'p4', authorId: 'sam', createdAt: now - 2 * day,
        text: 'Anyone have recommendations for a scenic route from Denver to Moab? Taking the long way this fall.',
        likes: [],
        comments: [
          { id: 'c4', authorId: 'theo', text: 'Take I-70 to Highway 128 along the Colorado River. Unreal views.', createdAt: now - 1.5 * day }
        ]
      }
    ],
    threads: [
      {
        id: 't1', category: 'Fitness', authorId: 'marcus', createdAt: now - 1 * hr,
        title: 'Share your current training split',
        body: 'Curious what everyone is running right now. I am on a 4-day upper/lower split. What is working for you?',
        replies: [
          { id: 'r1', authorId: 'sam', text: 'Push/pull/legs, 6 days. Probably too much, but I enjoy it.', createdAt: now - 40 * min },
          { id: 'r2', authorId: 'james', text: 'Three full-body days. Busy schedule, keeps me consistent.', createdAt: now - 20 * min }
        ]
      },
      {
        id: 't2', category: 'Style', authorId: 'james', createdAt: now - 1 * day,
        title: 'First suit: off-the-rack plus tailoring, or made to measure?',
        body: 'A friend is buying his first proper suit for a wedding. Budget is around $600. What would you recommend?',
        replies: [
          { id: 'r3', authorId: 'theo', text: 'Off-the-rack in navy plus $100 of tailoring beats a cheap MTM every time.', createdAt: now - 20 * hr }
        ]
      },
      {
        id: 't3', category: 'Career', authorId: 'theo', createdAt: now - 3 * day,
        title: 'How do you negotiate a raise without making it awkward?',
        body: 'Review season is coming up. Looking for scripts or approaches that have worked for you.',
        replies: []
      },
      {
        id: 't4', category: 'General', authorId: 'sam', createdAt: now - 5 * day,
        title: 'Welcome! Introduce yourself here',
        body: 'New to Gents Socials? Drop a quick intro: where you are from and what you are into.',
        replies: [
          { id: 'r4', authorId: 'james', text: 'James here, from Chicago. Into tailoring and good coffee.', createdAt: now - 4.5 * day },
          { id: 'r5', authorId: 'marcus', text: 'Marcus, Austin TX. Gym, grill, repeat.', createdAt: now - 4 * day }
        ]
      }
    ]
  };
};
