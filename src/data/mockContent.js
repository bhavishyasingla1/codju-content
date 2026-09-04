// Mock content data for the Codju Content Dashboard
// Each item represents a content piece for a specific month

const MOCK_CONTENT = {
  '2026-07': [
    {
      id: 'c1',
      date: '2026-07-01',
      name: 'July Welcome Post',
      type: 'static',
      summary: 'Kick off July with a vibrant welcome graphic featuring summer colors and our mascot.',
      caption: '🎉 July is here! New month, new content, new energy. Let\'s make it count! #Codju #ContentCreation',
      platform: 'instagram',
      status: 'published',
      assets: [],
      createdAt: '2026-06-28T10:00:00Z',
      updatedAt: '2026-07-01T09:00:00Z',
    },
    {
      id: 'c2',
      date: '2026-07-03',
      name: 'Product Feature Carousel',
      type: 'carousel',
      summary: 'Showcase the top 5 features of Codju in a swipeable carousel format.',
      caption: 'Swipe through to discover what makes Codju different ✨\n\n1️⃣ Smart Content Calendar\n2️⃣ Team Collaboration\n3️⃣ AI-Powered Suggestions\n4️⃣ Multi-Platform Publishing\n5️⃣ Analytics Dashboard\n\n#Codju #ProductFeatures #ContentMarketing',
      platform: 'instagram',
      status: 'ready',
      assets: [],
      createdAt: '2026-06-30T14:00:00Z',
      updatedAt: '2026-07-02T16:00:00Z',
    },
    {
      id: 'c3',
      date: '2026-07-05',
      name: 'Behind the Scenes Reel',
      type: 'reel',
      summary: 'A quick behind-the-scenes look at the Codju team building new features.',
      caption: 'Ever wonder what happens behind the scenes? 🎬\n\nHere\'s a sneak peek at the Codju team in action!\n\n#BTS #StartupLife #Codju',
      script: 'SCENE 1: Wide shot of the office\nNARRATOR: "At Codju, every day is a chance to create something amazing."\n\nSCENE 2: Close-up of team working\nNARRATOR: "Our team is passionate about making content creation effortless."\n\nSCENE 3: Product demo on screen\nNARRATOR: "And it shows in every feature we build."\n\nSCENE 4: Team celebration\nNARRATOR: "Join us on this journey. Follow @codju for more!"',
      platform: 'instagram',
      status: 'draft',
      assets: [],
      thumbnailAsset: null,
      createdAt: '2026-07-01T09:00:00Z',
      updatedAt: '2026-07-01T09:00:00Z',
    },
    {
      id: 'c4',
      date: '2026-07-07',
      name: 'LinkedIn Thought Leadership',
      type: 'text',
      summary: 'A thought leadership post about the future of content marketing for LinkedIn.',
      richText: '<p>The future of content marketing isn\'t about posting more — it\'s about posting <strong>smarter</strong>.</p><p>Here are 3 trends I\'m seeing reshape the industry:</p><ul><li><strong>AI-assisted creation</strong> is making quality content accessible to teams of all sizes</li><li><strong>Personalization at scale</strong> is no longer optional — audiences expect it</li><li><strong>Short-form video</strong> continues to dominate engagement metrics</li></ul><p>At Codju, we\'re building tools that help teams navigate this shift without the overwhelm.</p><p>What trends are you seeing in your content strategy? 👇</p>',
      platform: 'linkedin',
      status: 'ready',
      assets: [],
      createdAt: '2026-07-03T11:00:00Z',
      updatedAt: '2026-07-06T15:00:00Z',
    },
    {
      id: 'c5',
      date: '2026-07-10',
      name: 'Customer Testimonial Static',
      type: 'static',
      summary: 'Beautiful quote graphic featuring a customer testimonial about Codju.',
      caption: '"Codju transformed how our team manages content. What used to take hours now takes minutes." — Sarah Chen, Marketing Lead at TechFlow\n\n#CustomerLove #Codju #Testimonial',
      platform: 'instagram',
      status: 'draft',
      assets: [],
      createdAt: '2026-07-05T10:00:00Z',
      updatedAt: '2026-07-05T10:00:00Z',
    },
    {
      id: 'c6',
      date: '2026-07-14',
      name: 'Tips & Tricks Carousel',
      type: 'carousel',
      summary: '7 content marketing tips in a beautifully designed carousel format.',
      caption: '7 Content Marketing Tips You Need in 2026 📝\n\nSave this for later! ↗️\n\n#ContentTips #MarketingStrategy #Codju',
      platform: 'instagram',
      status: 'draft',
      assets: [],
      createdAt: '2026-07-08T09:00:00Z',
      updatedAt: '2026-07-08T09:00:00Z',
    },
    {
      id: 'c7',
      date: '2026-07-18',
      name: 'Product Update Reel',
      type: 'reel',
      summary: 'Quick 30-second reel showing the latest Codju dashboard features.',
      caption: '🚀 New features just dropped!\n\nCheck out the latest updates to the Codju dashboard.\n\n#ProductUpdate #Codju #NewFeatures',
      script: 'INTRO: Quick logo animation (2s)\n\nFEATURE 1: "New Calendar View" — show calendar UI (5s)\nFEATURE 2: "Drag & Drop Reordering" — show drag interaction (5s)\nFEATURE 3: "Instant Search" — show search in action (5s)\n\nOUTRO: "Try Codju today" CTA with link (3s)',
      platform: 'instagram',
      status: 'draft',
      assets: [],
      thumbnailAsset: null,
      createdAt: '2026-07-10T14:00:00Z',
      updatedAt: '2026-07-10T14:00:00Z',
    },
    {
      id: 'c8',
      date: '2026-07-22',
      name: 'Twitter/X Thread',
      type: 'text',
      summary: 'A Twitter/X thread about why content calendars matter for growing brands.',
      richText: '<p>🧵 Why every growing brand needs a content calendar (and why spreadsheets aren\'t enough):</p><p><strong>1/ Planning reduces chaos.</strong> When your content is planned ahead, your team spends less time deciding what to post and more time creating quality content.</p><p><strong>2/ Consistency builds trust.</strong> Audiences notice when brands post regularly. A calendar keeps you accountable.</p><p><strong>3/ Better cross-platform strategy.</strong> Seeing all your content in one view helps you tailor messages for each platform.</p><p><strong>4/ Easier collaboration.</strong> Everyone knows what\'s coming, who\'s responsible, and when it\'s due.</p><p><strong>5/ Data-driven decisions.</strong> Track what works and double down on winning content types.</p><p>That\'s exactly why we built Codju — a content dashboard that makes all of this effortless. 💜</p>',
      platform: 'twitter',
      status: 'draft',
      assets: [],
      createdAt: '2026-07-12T16:00:00Z',
      updatedAt: '2026-07-12T16:00:00Z',
    },
    {
      id: 'c9',
      date: '2026-07-25',
      name: 'Brand Story Carousel',
      type: 'carousel',
      summary: 'The Codju origin story told through a 6-slide carousel with illustrations.',
      caption: 'The story of how Codju was born 💜\n\nFrom a simple idea to a platform that\'s changing how teams create content.\n\nSwipe to read our journey →\n\n#StartupStory #Codju #OurJourney',
      platform: 'instagram',
      status: 'draft',
      assets: [],
      createdAt: '2026-07-15T11:00:00Z',
      updatedAt: '2026-07-15T11:00:00Z',
    },
    {
      id: 'c10',
      date: '2026-07-29',
      name: 'Month Recap Static',
      type: 'static',
      summary: 'End-of-month recap graphic highlighting July achievements and content stats.',
      caption: '📊 July Recap!\n\n✅ 10 pieces of content published\n✅ 2 viral reels\n✅ 500+ new followers\n✅ 3x engagement increase\n\nOnwards to August! 🚀\n\n#MonthlyRecap #Codju #GrowthMindset',
      platform: 'instagram',
      status: 'draft',
      assets: [],
      createdAt: '2026-07-20T09:00:00Z',
      updatedAt: '2026-07-20T09:00:00Z',
    },
  ],
  '2026-06': [
    {
      id: 'c11',
      date: '2026-06-05',
      name: 'Summer Launch Announcement',
      type: 'static',
      summary: 'Announcement graphic for the summer product launch.',
      caption: '☀️ Summer is here, and so is our biggest update yet! Stay tuned... #Codju #ComingSoon',
      platform: 'instagram',
      status: 'published',
      assets: [],
      createdAt: '2026-05-28T10:00:00Z',
      updatedAt: '2026-06-05T09:00:00Z',
    },
    {
      id: 'c12',
      date: '2026-06-15',
      name: 'Team Introduction Carousel',
      type: 'carousel',
      summary: 'Meet the Codju team — each slide features one team member.',
      caption: 'Meet the amazing people behind Codju! 👋\n\nSwipe to get to know us →\n\n#MeetTheTeam #Codju',
      platform: 'instagram',
      status: 'published',
      assets: [],
      createdAt: '2026-06-10T14:00:00Z',
      updatedAt: '2026-06-15T09:00:00Z',
    },
  ],
};

// Platform options
export const PLATFORMS = [
  // Social platforms
  { value: 'instagram', label: 'Instagram', category: 'social' },
  { value: 'linkedin', label: 'LinkedIn', category: 'all' },
  { value: 'twitter', label: 'Twitter/X', category: 'social' },
  { value: 'threads', label: 'Threads', category: 'social' },
  { value: 'youtube', label: 'YouTube', category: 'social' },
  { value: 'tiktok', label: 'TikTok', category: 'social' },
  { value: 'facebook', label: 'Facebook', category: 'social' },
  // Written content platforms
  { value: 'website', label: 'Website Blog', category: 'written' },
  { value: 'medium', label: 'Medium', category: 'written' },
  { value: 'substack', label: 'Substack', category: 'written' },
  { value: 'newsletter', label: 'Email Newsletter', category: 'written' },
  { value: 'devto', label: 'Dev.to / Hashnode', category: 'written' },
];

// Content type definitions (Carousel, Static Post, Text/Thought, Blog Article, Newsletter)
export const CONTENT_TYPES = [
  // Social types
  { value: 'carousel', label: 'Carousel', color: 'var(--color-type-carousel)', bg: 'var(--color-type-carousel-bg)', category: 'social' },
  { value: 'static', label: 'Static Post', color: 'var(--color-type-static)', bg: 'var(--color-type-static-bg)', category: 'social' },
  { value: 'text', label: 'Text / Thought', color: 'var(--color-type-text)', bg: 'var(--color-type-text-bg)', category: 'all' },
  // Written content types
  { value: 'blog', label: 'Blog Article', color: 'var(--color-type-blog)', bg: 'var(--color-type-blog-bg)', category: 'written' },
  { value: 'newsletter', label: 'Newsletter', color: 'var(--color-type-newsletter)', bg: 'var(--color-type-newsletter-bg)', category: 'written' },
];

// Status definitions
export const STATUSES = [
  { value: 'draft', label: 'Draft', color: 'var(--color-status-draft)', bg: 'var(--color-status-draft-bg)' },
  { value: 'pending', label: 'In Review', color: '#D97706', bg: '#FEF3C7' },
  { value: 'revision', label: 'Needs Changes', color: '#DC2626', bg: '#FEE2E2' },
  { value: 'ready', label: 'Approved', color: 'var(--color-status-ready)', bg: 'var(--color-status-ready-bg)' },
  { value: 'published', label: 'Published', color: 'var(--color-status-published)', bg: 'var(--color-status-published-bg)' },
];

// Written content has strictly 3 statuses: Draft, Ready, Published
export const WRITTEN_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'var(--color-status-draft)', bg: 'var(--color-status-draft-bg)' },
  { value: 'ready', label: 'Ready', color: 'var(--color-status-ready)', bg: 'var(--color-status-ready-bg)' },
  { value: 'published', label: 'Published', color: 'var(--color-status-published)', bg: 'var(--color-status-published-bg)' },
];

export function getStatusesByCategory(category = 'social') {
  return category === 'written' ? WRITTEN_STATUSES : STATUSES;
}

export function getTypesByCategory(category = 'social') {
  return CONTENT_TYPES.filter(t => t.category === category || t.category === 'all');
}

export function getPlatformsByCategory(category = 'social') {
  return PLATFORMS.filter(p => p.category === category || p.category === 'all');
}

export default MOCK_CONTENT;
