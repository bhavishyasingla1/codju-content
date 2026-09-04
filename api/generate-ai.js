// Rich Semantic Topic Generator for smart dynamic generation when external API keys are unavailable
function generateSmartSchedule(prompt, year, month, category = 'social') {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const rawPrompt = (prompt || '').trim();

  // Extract count if mentioned in prompt (e.g., "5 posts", "10 items", "create 8")
  const countMatch = rawPrompt.match(/(\d+)\s*(?:posts?|items?|articles?|blogs?|newsletters?|pieces?|rows?|ideas?)/i);
  let targetCount = countMatch ? parseInt(countMatch[1], 10) : 0;

  // Split prompt by lines, commas, semicolons, or numbered lists (1., 2., -, *)
  const rawLines = rawPrompt
    .split(/\n+|\r+|(?:\d+\.|\*|-)\s+/)
    .map(s => s.replace(/^[,\s;]+|[,\s;]+$/g, '').trim())
    .filter(s => s.length > 2 && !/^(?:create|generate|plan|schedule|make)\s+\d+/i.test(s));

  if (targetCount <= 0) {
    targetCount = Math.max(rawLines.length, category === 'written' ? 4 : 5);
  }
  targetCount = Math.min(Math.max(targetCount, 2), 20); // Clamp between 2 and 20

  const topics = rawLines.length > 0 ? rawLines : [rawPrompt || 'Industry Insights & Innovation'];

  // Clean prompt subject keyword
  const mainSubject = rawPrompt
    .replace(/(?:create|generate|plan|schedule|for|the|month|of|in|with|about|on|posts?|articles?|blogs?|\d+)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Content Marketing';

  if (category === 'written') {
    const writtenTypes = ['blog', 'newsletter'];
    const platforms = ['website', 'newsletter', 'medium', 'linkedin', 'substack'];

    const items = [];
    for (let i = 0; i < targetCount; i++) {
      const topic = topics[i % topics.length] || `${mainSubject} Guide: Part ${i + 1}`;
      const dayStep = Math.max(1, Math.floor((daysInMonth - 2) / targetCount));
      const day = Math.min(daysInMonth, 2 + i * dayStep);
      const type = writtenTypes[i % writtenTypes.length];
      const platform = platforms[i % platforms.length];

      // Formulate engaging title
      let title = topic;
      if (!/^(?:how|why|the|ultimate|deep|mastering|building|guide)/i.test(title)) {
        const titleTemplates = [
          `Deep Dive: ${topic}`,
          `The Ultimate Guide to ${topic}`,
          `How Modern Teams Master ${topic}`,
          `Monthly Editorial: ${topic} in Practice`,
          `5 Proven Strategies for ${topic}`
        ];
        title = titleTemplates[i % titleTemplates.length];
      }

      items.push({
        date: `${monthStr}-${String(day).padStart(2, '0')}`,
        name: title,
        type: type,
        category: 'written',
        platform: platform,
        summary: `Strategic breakdown and practical roadmap focusing on ${topic}.`,
        richText: `<p>In today's fast-moving landscape, mastering <strong>${topic}</strong> is essential for sustainable growth and operational excellence.</p><h3>Key Strategic Takeaways:</h3><ul><li>Foundational principles and common industry bottlenecks</li><li>Actionable implementation framework for modern teams</li><li>Measuring ROI and scaling your workflow efficiently</li></ul><p>Explore the full breakdown below to implement these best practices today.</p>`,
        caption: `🚀 New Editorial: ${title}. Dive deep into the strategies that drive consistent results.`
      });
    }
    return items;
  }

  // Social Category (Strictly: Carousel, Static Post, Text / Thought)
  const socialTypes = ['carousel', 'static', 'text'];
  const platforms = ['instagram', 'instagram', 'linkedin', 'twitter'];

  const items = [];
  for (let i = 0; i < targetCount; i++) {
    const topic = topics[i % topics.length] || `${mainSubject} Spotlight: Part ${i + 1}`;
    const dayStep = Math.max(1, Math.floor((daysInMonth - 2) / targetCount));
    const day = Math.min(daysInMonth, 1 + i * dayStep);
    const type = socialTypes[i % socialTypes.length];
    const platform = platforms[i % platforms.length];

    let title = topic;
    if (title.length > 50) {
      title = title.slice(0, 47) + '...';
    }

    // Clean topic tag for hashtag
    const cleanTag = topic
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .slice(0, 3)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');

    let caption = '';
    if (type === 'carousel') {
      caption = `Swipe through to master ${topic} ✨ 👉\n\n1️⃣ Step 1: Foundational setup & planning\n2️⃣ Step 2: Streamlined implementation\n3️⃣ Step 3: Optimization & real-world results\n\nSave this post for your next project! 📌\n\n#${cleanTag || 'ContentCreation'} #Productivity #MarketingStrategy #Codju`;
    } else if (type === 'text') {
      caption = `💡 Key Takeaway on ${topic}:\n\nThe most effective teams focus on consistency and scalable systems rather than ad-hoc effort.\n\nWhat is your top goal this month? Share below! 👇\n\n#${cleanTag || 'Leadership'} #GrowthStrategy #TechTrends`;
    } else {
      caption = `🚀 Spotlight: ${topic}!\n\nElevate your team roadmap with actionable insights and proven frameworks.\n\n👉 Full details on codju.app\n\n#${cleanTag || 'Innovation'} #Strategy #DigitalMarketing`;
    }

    items.push({
      date: `${monthStr}-${String(day).padStart(2, '0')}`,
      name: title,
      type: type,
      category: 'social',
      platform: platform,
      summary: `Engaging ${type === 'carousel' ? 'carousel' : type === 'text' ? 'text/thought' : 'static graphic'} post highlighting ${topic}.`,
      caption: caption
    });
  }

  return items;
}

// Call Groq API (openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b, llama-3.3-70b-versatile)
async function callGroqApi(apiKey, prompt, systemInstruction) {
  const models = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  
  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(9000),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
          max_tokens: 3500
        })
      });

      if (res.ok) {
        const data = await res.json();
        const contentStr = data.choices?.[0]?.message?.content;
        if (contentStr) {
          const parsed = JSON.parse(contentStr);
          // Return array if inside { items: [...] } or direct array
          return Array.isArray(parsed) ? parsed : (parsed.items || parsed.schedule || parsed.posts || Object.values(parsed)[0]);
        }
      }
    } catch (err) {
      console.warn(`Groq (${model}) error:`, err.message);
    }
  }
  return null;
}

// Call Google Gemini API
async function callGeminiApi(apiKey, prompt, systemInstruction) {
  const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(9000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text.trim());
          return Array.isArray(parsed) ? parsed : (parsed.items || parsed.schedule || parsed.posts || Object.values(parsed)[0]);
        }
      }
    } catch (err) {
      console.warn(`Gemini (${model}) error:`, err.message);
    }
  }
  return null;
}

// Call OpenAI API
async function callOpenAiApi(apiKey, prompt, systemInstruction) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(9000),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7
      })
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : (parsed.items || parsed.schedule || parsed.posts || Object.values(parsed)[0]);
      }
    }
  } catch (err) {
    console.warn('OpenAI error:', err.message);
  }
  return null;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    body = {};
  }
  const { prompt = '', year = 2026, month = 8, category = 'social', apiKey = '' } = body;

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const isWritten = category === 'written';
  const systemInstruction = isWritten
    ? `You are an expert editorial strategist and lead publication editor.
Analyze the user's input ideas, topics, outlines, or notes, and generate a complete, structured written editorial calendar for ${monthStr}.
Return a JSON object with an "items" array where each object has:
- "date": "YYYY-MM-DD" (must be within month ${monthStr})
- "name": "Engaging, professional article / newsletter title" (catchy, high CTR)
- "type": "blog" | "newsletter"
- "category": "written"
- "platform": "website" | "medium" | "substack" | "newsletter" | "linkedin"
- "summary": "Detailed executive summary of the piece"
- "richText": "<p>Starter draft intro...</p><h3>Key Takeaways</h3><ul><li>...</li></ul>"
- "caption": "Engaging social hook for promoting the article"

Make sure all dates fall in ${monthStr} and are chronologically spaced. Return valid JSON only.`
    : `You are a world-class social media content strategist and creative copywriter.
Analyze the user's input ideas, themes, scripts, or schedule request, and generate a high-performing social content calendar for ${monthStr}.
Return a JSON object with an "items" array where each object has:
- "date": "YYYY-MM-DD" (must be within month ${monthStr})
- "name": "Catchy, descriptive content title"
- "type": "carousel" | "static" | "text"
- "category": "social"
- "platform": "instagram" | "linkedin" | "twitter"
- "summary": "Clear, informative description of the visual and strategy"
- "caption": "Full, ready-to-publish caption with hooks, linebreaks, value points, call-to-action, and relevant hashtags (no markdown asterisks like * or **)"

Make sure all dates fall in ${monthStr} and are chronologically spaced. Return valid JSON only.`;

  try {
    let generatedItems = null;

    // 1. Try Groq API (High priority if key available)
    const groqKey = apiKey?.startsWith('gsk_') ? apiKey : process.env.GROQ_API_KEY;
    if (groqKey) {
      generatedItems = await callGroqApi(groqKey, prompt, systemInstruction);
    }

    // 2. Try Gemini API
    if (!generatedItems) {
      const geminiKey = apiKey?.startsWith('AIza') ? apiKey : process.env.GEMINI_API_KEY;
      if (geminiKey) {
        generatedItems = await callGeminiApi(geminiKey, prompt, systemInstruction);
      }
    }

    // 3. Try OpenAI API
    if (!generatedItems) {
      const openAiKey = apiKey?.startsWith('sk-') ? apiKey : process.env.OPENAI_API_KEY;
      if (openAiKey) {
        generatedItems = await callOpenAiApi(openAiKey, prompt, systemInstruction);
      }
    }

    // 4. If remote AI returns valid items, sanitize & validate
    if (Array.isArray(generatedItems) && generatedItems.length > 0) {
      const validated = generatedItems.map((item, idx) => ({
        date: item.date && item.date.startsWith(monthStr) ? item.date : `${monthStr}-${String(Math.min(28, 2 + idx * 4)).padStart(2, '0')}`,
        name: item.name || `Content Idea ${idx + 1}`,
        type: item.type || (isWritten ? 'blog' : 'static'),
        category: category,
        platform: item.platform || (isWritten ? 'website' : 'instagram'),
        summary: item.summary || '',
        caption: item.caption || '',
        richText: item.richText || (isWritten ? `<p>${item.summary || ''}</p>` : ''),
        script: item.script || ''
      }));
      return res.status(200).json({ success: true, items: validated, provider: 'ai' });
    }

    // 5. Fallback: Context-Aware Semantic Natural Language Generator
    const smartItems = generateSmartSchedule(prompt, year, month, category);
    return res.status(200).json({ success: true, items: smartItems, provider: 'smart_generator' });

  } catch (err) {
    console.error('Error in generate-ai:', err);
    const fallbackItems = generateSmartSchedule(prompt, year, month, category);
    return res.status(200).json({ success: true, items: fallbackItems, provider: 'fallback' });
  }
}
