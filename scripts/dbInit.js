import pg from 'pg';

const connectionString = process.env.DATABASE_URL || '';

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
  console.log('Connecting to database...');
  await client.connect();
  console.log('Connected to database successfully!');

  // Drop existing table if needed or just create it
  // Let's create the table
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT,
      caption TEXT,
      platform TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      assets JSONB DEFAULT '[]',
      rich_text TEXT,
      script TEXT,
      thumbnail_asset JSONB,
      pdf_asset JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  console.log('Creating content table if not exists...');
  await client.query(createTableQuery);
  console.log('Content table created or already exists.');

  const createNotesTableQuery = `
    CREATE TABLE IF NOT EXISTS month_notes (
      month_key TEXT PRIMARY KEY,
      notes TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  console.log('Creating month_notes table if not exists...');
  await client.query(createNotesTableQuery);
  console.log('Month_notes table created or already exists.');

  // Let's check if the table is empty
  const countRes = await client.query('SELECT COUNT(*) FROM content');
  const count = parseInt(countRes.rows[0].count, 10);
  console.log(`Current row count in content table: ${count}`);

  if (count === 0) {
    console.log('Inserting initial mock data...');
    const initialData = [
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
        rich_text: '',
        script: '',
        thumbnail_asset: null,
        pdf_asset: null,
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
        rich_text: '',
        script: '',
        thumbnail_asset: null,
        pdf_asset: null,
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
        rich_text: '',
        thumbnail_asset: null,
        pdf_asset: null,
      },
      {
        id: 'c4',
        date: '2026-07-07',
        name: 'LinkedIn Thought Leadership',
        type: 'text',
        summary: 'A thought leadership post about the future of content marketing for LinkedIn.',
        rich_text: '<p>The future of content marketing isn\'t about posting more — it\'s about posting <strong>smarter</strong>.</p><p>Here are 3 trends I\'m seeing reshape the industry:</p><ul><li><strong>AI-assisted creation</strong> is making quality content accessible to teams of all sizes</li><li><strong>Personalization at scale</strong> is no longer optional — audiences expect it</li><li><strong>Short-form video</strong> continues to dominate engagement metrics</li></ul><p>At Codju, we\'re building tools that help teams navigate this shift without the overwhelm.</p><p>What trends are you seeing in your content strategy? 👇</p>',
        platform: 'linkedin',
        status: 'ready',
        assets: [],
        script: '',
        thumbnail_asset: null,
        pdf_asset: null,
      }
    ];

    for (const item of initialData) {
      await client.query(
        `INSERT INTO content (id, date, name, type, summary, caption, platform, status, assets, rich_text, script, thumbnail_asset, pdf_asset)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          item.id,
          item.date,
          item.name,
          item.type,
          item.summary,
          item.caption,
          item.platform,
          item.status,
          JSON.stringify(item.assets),
          item.rich_text,
          item.script,
          JSON.stringify(item.thumbnail_asset),
          JSON.stringify(item.pdf_asset)
        ]
      );
    }
    console.log('Mock data inserted successfully.');
  }

  await client.end();
  console.log('Database initialization complete!');
}

initDb().catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
