import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { db, isInitialized, initError, checkEnvVars } from './firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Category rules engine
const CATEGORY_RULES = {
  api: {
    domainKeywords: ["swagger.io", "postman.com", "rapidapi.com", "graphql.org"],
    contentKeywords: [
      "api", "apis", "web api", "rest api", "restful", "graphql", "api key", "oauth", "jwt", "bearer token", 
      "endpoint", "endpoints", "rate limit", "api gateway", "webhook", "bola", "broken authentication", 
      "api security", "microservice", "grpc", "openapi", "api documentation", "swagger", "json api", "api top 10"
    ]
  },
  web: {
    domainKeywords: [
      "portswigger.net", "hackerone.com", "bugcrowd.com", "tryhackme.com", 
      "hackthebox.com", "medium.com", "dev.to", "stackoverflow.com", "github.com", 
      "mozilla.org", "w3schools.com", "css-tricks.com", "smashingmagazine.com", "web.dev"
    ],
    contentKeywords: [
      "XSS", "CSRF", "SQL injection", "broken access", "SSRF", "IDOR", "web vulnerability", 
      "web security", "frontend", "backend", "HTML", "CSS", "JavaScript", "React", 
      "Angular", "Vue", "Node.js", "web application", "browser", "DOM", "cookie", "session", "CORS"
    ]
  }
};

// Categorize Link (API takes priority over Web when both words are present)
function detectCategory(url, title, description) {
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch (e) {}

  const fullContent = `${url} ${title} ${description}`.toLowerCase();

  // 1. API Check First (Word boundary for 'api' / 'apis' or explicit API keywords/domains)
  if (/\bapis?\b/i.test(fullContent)) {
    return 'api';
  }
  for (const domain of CATEGORY_RULES.api.domainKeywords) {
    if (hostname.includes(domain)) return 'api';
  }
  for (const kw of CATEGORY_RULES.api.contentKeywords) {
    if (fullContent.includes(kw.toLowerCase())) return 'api';
  }

  // 2. Web Check Next
  for (const domain of CATEGORY_RULES.web.domainKeywords) {
    if (hostname.includes(domain)) return 'web';
  }
  for (const kw of CATEGORY_RULES.web.contentKeywords) {
    if (fullContent.includes(kw.toLowerCase())) return 'web';
  }

  return 'personal';
}

// OWASP Web Top 10 Shorthand Tag Matchers
const WEB_TAG_RULES = [
  { tag: "Broken Access Control", keywords: ["broken access", "access control", "idor", "privilege escalation", "forced browsing", "insecure direct object", "lfi", "rfi", "path traversal", "directory traversal", "authorization bypass", "bypassing access", "top 10 web"] },
  { tag: "Crypto Failures", keywords: ["cryptographic", "crypto", "encryption", "ssl", "tls", "certificate", "hashing", "plaintext", "sensitive data exposure", "weak cipher", "rsa", "aes"] },
  { tag: "Injection (XSS/SQLi)", keywords: ["injection", "sql injection", "sqli", "xss", "cross-site scripting", "command injection", "ldap injection", "template injection", "ssti", "remote code execution", "rce"] },
  { tag: "Insecure Design", keywords: ["insecure design", "threat model", "secure design", "design flaw", "architectural flaw", "business logic flaw"] },
  { tag: "Misconfiguration", keywords: ["misconfiguration", "default credentials", "unnecessary features", "error messages", "stack trace", "hardening", "directory listing", "debug mode"] },
  { tag: "Vulnerable Components", keywords: ["vulnerable component", "outdated", "cve", "dependency", "supply chain", "library vulnerability", "snyk", "npm audit"] },
  { tag: "Auth Failures", keywords: ["authentication", "login bypass", "brute force", "credential stuffing", "session fixation", "password", "2fa bypass", "mfa bypass", "session hijacking"] },
  { tag: "Integrity Failures", keywords: ["integrity", "ci/cd", "deserialization", "unsigned", "software update", "pipeline", "pickle", "untrusted data"] },
  { tag: "Logging & Monitoring", keywords: ["logging", "monitoring", "audit", "siem", "alerting", "incident response", "detection", "log injection", "splunk"] },
  { tag: "SSRF", keywords: ["ssrf", "server-side request forgery", "internal network", "metadata endpoint", "169.254"] }
];

// OWASP API Top 10 Shorthand Tag Matchers
const API_TAG_RULES = [
  { tag: "Broken Object Auth (BOLA)", keywords: ["bola", "object level", "object-level authorization", "idor in api", "broken object", "api1"] },
  { tag: "Broken Auth", keywords: ["broken authentication", "api authentication", "token", "oauth bypass", "api key leak", "bearer token", "jwt bypass", "api2"] },
  { tag: "Broken Property Auth", keywords: ["property level", "mass assignment", "excessive data", "object property", "auto-binding", "api3"] },
  { tag: "Unrestricted Resource", keywords: ["rate limit", "resource consumption", "dos", "throttling", "quota", "denial of service", "api4"] },
  { tag: "Broken Function Auth", keywords: ["function level", "admin endpoint", "privilege", "role-based", "rbac", "function authorization", "api5"] },
  { tag: "Business Flow Abuse", keywords: ["business flow", "business logic", "abuse", "scraping", "scalping", "automation", "bot attack", "api6"] },
  { tag: "API SSRF", keywords: ["ssrf", "server-side request", "fetch url", "redirect", "webhook ssrf", "api7"] },
  { tag: "API Misconfig", keywords: ["misconfiguration", "cors", "headers", "verbose error", "api config", "access-control-allow-origin", "api8"] },
  { tag: "Improper Inventory", keywords: ["inventory", "undocumented", "shadow api", "deprecated", "api version", "v1 vs v2", "api9"] },
  { tag: "Unsafe Consumption", keywords: ["third-party api", "external service", "unsafe consumption", "upstream", "external integration", "api10"] }
];

// Personal Generic Tags
const PERSONAL_TAG_RULES = [
  { tag: "Bookmark", keywords: ["bookmark", "save", "star"] },
  { tag: "Read Later", keywords: ["article", "blog", "read", "story", "news"] },
  { tag: "Tutorial", keywords: ["tutorial", "guide", "how to", "course", "learn", "example"] },
  { tag: "Tool", keywords: ["tool", "app", "utility", "extension", "library", "software", "theme"] },
  { tag: "Reference", keywords: ["cheat sheet", "docs", "documentation", "reference", "api docs", "spec"] },
  { tag: "Inspiration", keywords: ["design", "ui", "ux", "inspiration", "awesome", "showcase"] }
];

// Auto Tag Link
function autoTagLink(category, url, title, description) {
  const fullContent = `${url} ${title} ${description}`.toLowerCase();
  const matchedTags = [];

  let rules = [];
  if (category === 'web') rules = WEB_TAG_RULES;
  else if (category === 'api') rules = API_TAG_RULES;
  else rules = PERSONAL_TAG_RULES;

  for (const item of rules) {
    for (const kw of item.keywords) {
      if (fullContent.includes(kw.toLowerCase())) {
        if (!matchedTags.includes(item.tag)) {
          matchedTags.push(item.tag);
        }
        break;
      }
    }
  }

  // Fallback default tag if none matched
  if (matchedTags.length === 0) {
    if (category === 'web') matchedTags.push("Broken Access Control");
    else if (category === 'api') matchedTags.push("Broken Object Auth (BOLA)");
    else matchedTags.push("Bookmark");
  }

  return matchedTags;
}

// Scrape Metadata from URL
async function scrapeMetadata(targetUrl) {
  let formattedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = 'https://' + formattedUrl;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(formattedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
      }
    });
    clearTimeout(timeout);

    const html = await res.text();
    const $ = cheerio.load(html);

    // Title
    let title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('meta[name="title"]').attr('content') ||
                $('title').text().trim() ||
                formattedUrl;

    // Description
    let description = $('meta[property="og:description"]').attr('content') ||
                      $('meta[name="twitter:description"]').attr('content') ||
                      $('meta[name="description"]').attr('content') ||
                      'No description available.';

    // Image Detection & Fallback Logic
    let image = $('meta[property="og:image"]').attr('content') ||
                $('meta[property="og:image:secure_url"]').attr('content') ||
                $('meta[name="twitter:image"]').attr('content') ||
                $('meta[name="twitter:image:src"]').attr('content') ||
                $('link[rel="image_src"]').attr('href') ||
                '';

    // Parse JSON-LD if present
    if (!image) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html());
          if (json.image) {
            image = Array.isArray(json.image) ? json.image[0] : (json.image.url || json.image);
          }
        } catch (e) {}
      });
    }

    // Resolve relative image URL
    if (image && !image.startsWith('http://') && !image.startsWith('https://')) {
      try {
        image = new URL(image, formattedUrl).href;
      } catch (e) {}
    }

    // High quality screenshot fallback if no image found on page
    if (!image) {
      image = `https://v1.screenshot.11ty.dev/${encodeURIComponent(formattedUrl)}/opengraph/`;
    }

    // Favicon
    let favicon = $('link[rel="icon"]').attr('href') ||
                  $('link[rel="shortcut icon"]').attr('href') ||
                  $('link[rel="apple-touch-icon"]').attr('href') ||
                  '';
    if (favicon && !favicon.startsWith('http://') && !favicon.startsWith('https://')) {
      try {
        favicon = new URL(favicon, formattedUrl).href;
      } catch (e) {}
    } else if (!favicon) {
      try {
        const u = new URL(formattedUrl);
        favicon = `${u.origin}/favicon.ico`;
      } catch (e) {}
    }

    return {
      url: formattedUrl,
      title: title.trim(),
      description: description.trim(),
      image,
      favicon
    };
  } catch (err) {
    clearTimeout(timeout);
    // Fallback if request fails
    let domain = formattedUrl;
    try { domain = new URL(formattedUrl).hostname; } catch (e) {}
    return {
      url: formattedUrl,
      title: domain,
      description: 'Could not automatically fetch web page metadata.',
      image: `https://v1.screenshot.11ty.dev/${encodeURIComponent(formattedUrl)}/opengraph/`,
      favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    };
  }
}

function normalizeUrl(urlStr) {
  if (!urlStr) return '';
  try {
    const u = new URL(urlStr);
    return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch (e) {
    return urlStr.trim().replace(/\/$/, '').toLowerCase();
  }
}

function ensureDb(res) {
  if (!db || !isInitialized) {
    const envStatus = checkEnvVars();
    const reason = initError || 'Firestore is not initialized. Check Vercel environment variables.';
    res.status(500).json({
      error: 'Firestore connection error',
      details: reason,
      envStatus
    });
    return false;
  }
  return true;
}

// Routes

// GET /api/env-check (Diagnostic endpoint)
app.get('/api/env-check', (req, res) => {
  res.json({
    initialized: isInitialized,
    error: initError || null,
    envStatus: checkEnvVars()
  });
});

// GET /api/links
app.get('/api/links', async (req, res) => {
  try {
    if (!ensureDb(res)) return;
    const { category, tag, search, favorite } = req.query;
    const snapshot = await db.collection('links').get();
    
    let links = [];
    snapshot.forEach(doc => {
      links.push({ id: doc.id, ...doc.data() });
    });

    if (category) {
      links = links.filter(l => l.category === category);
    }
    if (tag && tag !== 'All') {
      links = links.filter(l => l.tags && l.tags.some(t => t.toLowerCase().includes(tag.toLowerCase())));
    }
    if (favorite === 'true') {
      links = links.filter(l => l.favorite === true);
    }
    if (search) {
      const q = search.toLowerCase();
      links = links.filter(l => 
        (l.title && l.title.toLowerCase().includes(q)) ||
        (l.description && l.description.toLowerCase().includes(q)) ||
        (l.url && l.url.toLowerCase().includes(q)) ||
        (l.notes && l.notes.toLowerCase().includes(q))
      );
    }

    links.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json(links);
  } catch (err) {
    console.error('Error fetching links from Firestore:', err);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// GET /api/preview
app.get('/api/preview', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  const meta = await scrapeMetadata(url);
  const category = detectCategory(meta.url, meta.title, meta.description);
  const tags = autoTagLink(category, meta.url, meta.title, meta.description);
  res.json({ ...meta, category, tags });
});

// POST /api/links
app.post('/api/links', async (req, res) => {
  try {
    if (!ensureDb(res)) return;
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const targetNorm = normalizeUrl(url);

    // Duplicate check in Firestore
    const existingSnap = await db.collection('links')
      .where('normalizedUrl', '==', targetNorm)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      return res.status(409).json({
        error: 'Link already exists',
        duplicate: true,
        existingLink: { id: existingDoc.id, ...existingDoc.data() }
      });
    }

    const meta = await scrapeMetadata(url);
    const category = detectCategory(meta.url, meta.title, meta.description);
    const tags = autoTagLink(category, meta.url, meta.title, meta.description);

    const docId = crypto.randomUUID();
    const newLink = {
      id: docId,
      url: meta.url,
      normalizedUrl: targetNorm,
      title: meta.title,
      description: meta.description,
      image: meta.image,
      favicon: meta.favicon,
      category,
      tags,
      notes: '',
      favorite: false,
      createdAt: new Date().toISOString()
    };

    await db.collection('links').doc(docId).set(newLink);

    res.status(201).json(newLink);
  } catch (err) {
    console.error('Error creating link in Firestore:', err);
    res.status(500).json({ error: 'Failed to save link', details: err.message });
  }
});

// PUT /api/links/:id
app.put('/api/links/:id', async (req, res) => {
  try {
    if (!ensureDb(res)) return;
    const { id } = req.params;
    const docRef = db.collection('links').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const { category, tags, notes, favorite, title, description, image } = req.body;
    const updates = {};
    if (category !== undefined) updates.category = category;
    if (tags !== undefined) updates.tags = tags;
    if (notes !== undefined) updates.notes = notes;
    if (favorite !== undefined) updates.favorite = favorite;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (image !== undefined) updates.image = image;

    await docRef.update(updates);

    const updatedSnap = await docRef.get();
    res.json({ id: updatedSnap.id, ...updatedSnap.data() });
  } catch (err) {
    console.error('Error updating link in Firestore:', err);
    res.status(500).json({ error: 'Failed to update link' });
  }
});

// DELETE /api/links/:id
app.delete('/api/links/:id', async (req, res) => {
  try {
    if (!ensureDb(res)) return;
    const { id } = req.params;
    const docRef = db.collection('links').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Link not found' });
    }

    await docRef.delete();
    res.json({ message: 'Link deleted successfully' });
  } catch (err) {
    console.error('Error deleting link from Firestore:', err);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// POST /api/links/sync - Legacy sync compatibility endpoint
app.post('/api/links/sync', async (req, res) => {
  res.json({ message: 'Firestore is single source of truth' });
});

// POST /api/links/import - Batch import links into Firestore
app.post('/api/links/import', async (req, res) => {
  try {
    if (!ensureDb(res)) return;
    const rawData = req.body;
    const importedLinks = Array.isArray(rawData) ? rawData : (rawData && Array.isArray(rawData.links) ? rawData.links : null);
    
    if (!importedLinks) {
      return res.status(400).json({ error: 'Invalid JSON payload. Expected array of links or object with links array.' });
    }

    const snapshot = await db.collection('links').get();
    const existingMap = new Map();
    snapshot.forEach(doc => {
      const data = doc.data();
      existingMap.set(doc.id, doc.id);
      if (data.normalizedUrl) existingMap.set(data.normalizedUrl, doc.id);
      if (data.url) existingMap.set(normalizeUrl(data.url), doc.id);
    });

    let addedCount = 0;
    const batch = db.batch();

    for (const link of importedLinks) {
      if (!link || !link.url) continue;
      const norm = normalizeUrl(link.url);
      const existingDocId = (link.id && existingMap.has(link.id)) ? existingMap.get(link.id) : existingMap.get(norm);

      if (!existingDocId) {
        const newId = link.id || crypto.randomUUID();
        const docRef = db.collection('links').doc(newId);
        batch.set(docRef, {
          id: newId,
          url: link.url,
          normalizedUrl: norm,
          title: link.title || link.url,
          description: link.description || '',
          image: link.image || '',
          favicon: link.favicon || '',
          category: link.category || 'personal',
          tags: Array.isArray(link.tags) ? link.tags : [],
          notes: link.notes || '',
          favorite: Boolean(link.favorite),
          createdAt: link.createdAt || new Date().toISOString()
        });
        existingMap.set(newId, newId);
        existingMap.set(norm, newId);
        addedCount++;
      } else {
        const docRef = db.collection('links').doc(existingDocId);
        const updates = {};
        if (link.notes !== undefined && link.notes !== '') updates.notes = link.notes;
        if (link.favorite !== undefined) updates.favorite = Boolean(link.favorite);
        if (Object.keys(updates).length > 0) {
          batch.update(docRef, updates);
        }
      }
    }

    await batch.commit();

    const updatedSnap = await db.collection('links').get();
    const allLinks = [];
    updatedSnap.forEach(doc => allLinks.push({ id: doc.id, ...doc.data() }));
    allLinks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({ message: `Successfully imported ${addedCount} new links!`, count: addedCount, links: allLinks });
  } catch (err) {
    console.error('Error importing links into Firestore:', err);
    res.status(500).json({ error: 'Failed to import link data' });
  }
});

app.use(express.static(path.join(__dirname, 'client/dist')));
app.use(express.static(path.join(__dirname, 'client')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'client/index.html'));
  }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚔️ Link Vault API Server running at http://0.0.0.0:${PORT}`);
  });
}

export default app;
