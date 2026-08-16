import { Request, Response } from 'express';
import { SCENARIOS, CATEGORIES, getScenarioBySlug, Scenario, TruthLevel } from '../config/scenarios';

function renderTruthBadge(truthLevel: TruthLevel, text: string): string {
  let badgeStyle = 'background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;';
  let icon = '✓';
  if (truthLevel === 'SUPPORTED') {
    badgeStyle = 'background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;';
    icon = '⚡';
  } else if (truthLevel === 'EXAMPLE') {
    badgeStyle = 'background:#fffbeb; color:#d97706; border:1px solid #fde68a;';
    icon = '💡';
  }

  return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; ${badgeStyle}"><span>${icon}</span> ${text}</span>`;
}

function renderHeader(): string {
  return `
  <style>
    .uc-nav-right{display:flex;align-items:center;gap:12px;}
    .uc-navlinks{display:flex;gap:20px;align-items:center;font-size:13px;font-weight:600;}
    .uc-menu-toggle{display:none;background:none;border:1px solid #e5ded4;border-radius:8px;width:38px;height:38px;padding:0;cursor:pointer;flex-direction:column;align-items:center;justify-content:center;gap:4.5px;}
    .uc-menu-toggle span{display:block;width:18px;height:2px;background:#181716;border-radius:2px;}
    @media(max-width:920px){
      .uc-menu-toggle{display:flex;}
      .uc-navlinks{display:none;position:absolute;top:68px;left:0;right:0;background:#faf9f6;border:1px solid #e5ded4;border-radius:16px;padding:20px;flex-direction:column;align-items:flex-start;gap:12px;box-shadow:0 12px 32px rgba(38,29,22,.12);z-index:99;}
      .uc-navlinks.open{display:flex;}
      .uc-navlinks a{width:100%;padding:10px 0;font-size:14.5px;font-weight:600;color:#181716;border-bottom:1px solid #f0e8dc;}
      .uc-navlinks a:last-child{border-bottom:0;}
    }
  </style>
  <nav style="max-width:1100px; margin:0 auto; padding:20px 24px; display:flex; align-items:center; justify-content:space-between; position:relative;">
    <a href="/" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:#181716; font-weight:850; font-size:20px;">
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="14" stroke="#0F0F11" stroke-width="3.8" stroke-dasharray="67 21" stroke-linecap="round" transform="rotate(-65 20 20)"/>
        <g transform="rotate(-38 20 20)">
          <path d="M 15 13.5 L 20 7.5 L 25 13.5 L 25 27 C 25 29 23.5 30.5 21.5 30.5 L 18.5 30.5 C 16.5 30.5 15 29 15 27 Z" fill="#F59E0B"/>
          <circle cx="20" cy="13" r="2.2" fill="#FAF9F6"/>
        </g>
      </svg>
      <span>ai<span style="color:#f59e0b;">pp</span></span>
    </a>
    <div class="uc-nav-right">
      <div class="uc-navlinks" id="uc-nav-menu">
        <a href="/use-cases" style="color:#f59e0b; text-decoration:none;">Use Cases</a>
        <a href="/store" style="color:#6f6a65; text-decoration:none;">Store</a>
        <a href="/aipp-extension.zip" download="aipp-extension.zip" style="color:#b45309; text-decoration:none; font-weight:700;">Chrome Extension</a>
        <a href="/docs.html" style="color:#6f6a65; text-decoration:none;">Developers</a>
        <a href="/dashboard.html" style="background:#111; color:#fff!important; padding:8px 16px; border-radius:9px; text-decoration:none; text-align:center;">Studio Console →</a>
      </div>
      <button class="uc-menu-toggle" id="uc-menu-toggle" aria-label="Toggle Navigation Menu" aria-expanded="false">
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>
  </nav>
  <script>
    (function(){
      var btn = document.getElementById('uc-menu-toggle');
      var menu = document.getElementById('uc-nav-menu');
      if(!btn || !menu) return;
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var open = menu.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', function(e){
        if(menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)){
          menu.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    })();
  </script>`;
}

function renderFooter(): string {
  return `
  <footer style="border-top:1px solid #e5ded4; margin-top:64px; padding:32px 24px; background:#fffdf9;">
    <div style="max-width:1100px; margin:0 auto; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; font-size:12px; color:#85817b;">
      <div>© 2026 aipp · Open Protocol for Human + Agent Commerce</div>
      <div style="display:flex; gap:16px;">
        <a href="/use-cases" style="color:inherit; text-decoration:none;">Use Cases</a>
        <a href="/store" style="color:inherit; text-decoration:none;">Store</a>
        <a href="/docs.html" style="color:inherit; text-decoration:none;">Docs</a>
        <a href="/legal.html" style="color:inherit; text-decoration:none;">Legal</a>
        <a href="mailto:info@aipp.dev" style="color:inherit; text-decoration:none;">Contact</a>
      </div>
    </div>
  </footer>`;
}

function renderPersonaCta(scenario: Scenario): string {
  if (['apis-developers', 'automation', 'ai-agents'].includes(scenario.category)) {
    return `
    <div style="background:#111; color:#fff; border-radius:20px; padding:36px; text-align:center; margin-bottom:60px;">
      <h2 style="font-family:Georgia, serif; font-size:26px; font-weight:500; margin:0 0 10px 0;">Implement ${scenario.title} with AIPP</h2>
      <p style="font-size:14px; color:#a1a1aa; max-width:500px; margin:0 auto 20px;">Read the developer documentation or generate your API key to gate requests behind Lightning and Base USDC payments.</p>
      <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
        <a href="/docs.html" style="display:inline-block; background:#f59e0b; color:#111; font-weight:800; font-size:14px; padding:12px 28px; border-radius:10px; text-decoration:none;">View Developer Docs →</a>
        <a href="/dashboard.html" style="display:inline-block; background:#27272a; color:#fff; font-weight:700; font-size:14px; padding:12px 24px; border-radius:10px; text-decoration:none;">Open Studio Console</a>
      </div>
    </div>`;
  } else if (['content-digital-goods', 'creators-independent-work'].includes(scenario.category)) {
    return `
    <div style="background:#111; color:#fff; border-radius:20px; padding:36px; text-align:center; margin-bottom:60px;">
      <h2 style="font-family:Georgia, serif; font-size:26px; font-weight:500; margin:0 0 10px 0;">Start Monetizing ${scenario.title}</h2>
      <p style="font-size:14px; color:#a1a1aa; max-width:500px; margin:0 auto 20px;">Create a Smart Tag payment link to accept supported Lightning and Base USDC payments for your digital content.</p>
      <a href="/dashboard.html" style="display:inline-block; background:#f59e0b; color:#111; font-weight:800; font-size:14px; padding:12px 28px; border-radius:10px; text-decoration:none;">Create Payment Link →</a>
    </div>`;
  } else {
    return `
    <div style="background:#111; color:#fff; border-radius:20px; padding:36px; text-align:center; margin-bottom:60px;">
      <h2 style="font-family:Georgia, serif; font-size:26px; font-weight:500; margin:0 0 10px 0;">Gate ${scenario.title} Queries with AIPP</h2>
      <p style="font-size:14px; color:#a1a1aa; max-width:500px; margin:0 auto 20px;">Require payment verification before executing data queries or research synthesis.</p>
      <a href="/dashboard.html" style="display:inline-block; background:#f59e0b; color:#111; font-weight:800; font-size:14px; padding:12px 28px; border-radius:10px; text-decoration:none;">Open Studio Console →</a>
    </div>`;
  }
}

export function renderUseCasesIndex(req: Request, res: Response): void {
  let cardsHtml = '';
  SCENARIOS.forEach(s => {
    cardsHtml += `
    <div class="scenario-card" data-category="${s.category}" style="background:#fff; border:1.5px solid #e5ded4; border-radius:16px; padding:24px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 15px rgba(0,0,0,0.03); transition:transform 0.2s ease;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:8px;">
          <span style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#71717a; background:#f4f4f5; padding:3px 8px; border-radius:12px;">${s.category_label}</span>
          ${renderTruthBadge(s.truth_level, s.truth_badge_text)}
        </div>
        <h3 style="font-family:'Plus Jakarta Sans', sans-serif; font-size:18px; font-weight:800; margin:0 0 8px 0; color:#181716;">
          <a href="/use-cases/${s.slug}" style="text-decoration:none; color:inherit;">${s.title}</a>
        </h3>
        <p style="font-size:13px; line-height:1.5; color:#6f6a65; margin:0 0 16px 0;">${s.short_description}</p>
      </div>
      <div>
        <div style="display:flex; gap:10px; font-size:11px; color:#85817b; margin-bottom:16px;">
          <span>⚡ Lightning</span>
          <span>•</span>
          <span>🔵 Base USDC</span>
        </div>
        <a href="/use-cases/${s.slug}" style="display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:#b45309; text-decoration:none;">Read Use Case →</a>
      </div>
    </div>`;
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIPP Use Cases &amp; Solutions — Real Problem Guides</title>
  <meta name="description" content="Explore real-world technical guides showing how creators, developers, and AI engineers use AIPP for pay-per-use monetization.">
  <link rel="canonical" href="https://aipp.dev/use-cases">
  <meta property="og:title" content="AIPP Use Cases &amp; Solutions">
  <meta property="og:description" content="Documented real-world solutions for monetizing APIs, AI agents, automations, and digital files.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://aipp.dev/use-cases">
  <link rel="icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { margin:0; font-family:'Plus Jakarta Sans', -apple-system, sans-serif; background:#faf7f2; color:#181716; }
    .container { max-width:1100px; margin:0 auto; padding:0 24px; }
    .hero { text-align:center; padding:48px 0 32px; }
    .hero h1 { font-family:Georgia, serif; font-size:42px; font-weight:500; margin:0 0 12px 0; color:#181716; }
    .hero p { font-size:16px; color:#6f6a65; max-width:640px; margin:0 auto 28px; line-height:1.6; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:20px; margin-bottom:48px; }
    .scenario-card:hover { transform:translateY(-4px); border-color:#f59e0b; }
    @media (max-width: 720px) {
      .hero h1 { font-size:32px; }
      .grid { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  ${renderHeader()}
  <div class="container">
    <section class="hero">
      <span style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#b45309; background:#fffbeb; padding:4px 12px; border-radius:20px; border:1px solid #fde68a;">Real Problems · Genuine Solutions</span>
      <h1>AIPP Use Cases</h1>
      <p>What can you use AIPP for? Explore guides showing how creators, developers, and AI engineers solve monetisation friction with pay-per-use payments.</p>
    </section>

    <div class="grid">
      ${cardsHtml}
    </div>

    <!-- Onboarding CTA -->
    <div style="background:#111; color:#fff; border-radius:20px; padding:40px 32px; text-align:center; margin-bottom:60px;">
      <h2 style="font-family:Georgia, serif; font-size:28px; font-weight:500; margin:0 0 10px 0;">Ready to price your file, link, or API?</h2>
      <p style="font-size:14px; color:#a1a1aa; max-width:540px; margin:0 auto 24px; line-height:1.5;">Turn a URL or endpoint into an AIPP Smart Tag. Compatible with human web browsers and AI agents.</p>
      <a href="/dashboard.html" style="display:inline-block; background:#f59e0b; color:#111; font-weight:800; font-size:14px; padding:12px 28px; border-radius:10px; text-decoration:none;">Create Smart Tag →</a>
    </div>
  </div>
  ${renderFooter()}
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

export function renderUseCaseDetail(req: Request, res: Response): void {
  const slug = req.params.slug;
  const scenario = getScenarioBySlug(slug);

  if (!scenario) {
    res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head><title>Use Case Not Found — AIPP</title></head>
<body style="font-family:sans-serif; text-align:center; padding:50px; background:#faf7f2;">
  <h1>Use Case Not Found</h1>
  <p>The scenario "${slug}" does not exist.</p>
  <a href="/use-cases">← Back to Use Cases</a>
</body>
</html>`);
    return;
  }

  // Payment flow HTML
  let flowHtml = '';
  scenario.payment_flow.forEach(step => {
    flowHtml += `
    <div style="background:#fff; border:1px solid #e5ded4; border-radius:12px; padding:16px; position:relative;">
      <span style="font-size:10px; font-weight:850; color:#2563eb; background:#eff6ff; padding:2px 6px; border-radius:6px; margin-bottom:8px; display:inline-block;">STEP ${step.step}</span>
      <strong style="display:block; font-size:14px; margin-bottom:4px; color:#181716;">${step.title}</strong>
      <small style="font-size:11.5px; color:#6f6a65; line-height:1.4; display:block;">${step.description}</small>
    </div>`;
  });

  // What AIPP does vs does not do
  let doesHtml = '';
  scenario.what_aipp_does.forEach(item => {
    doesHtml += `<li style="margin-bottom:8px; display:flex; align-items:flex-start; gap:8px;"><span style="color:#10b981; font-weight:800;">✓</span> <span>${item}</span></li>`;
  });

  let doesNotHtml = '';
  scenario.what_aipp_does_not_do.forEach(item => {
    doesNotHtml += `<li style="margin-bottom:8px; display:flex; align-items:flex-start; gap:8px;"><span style="color:#ef4444; font-weight:800;">✗</span> <span>${item}</span></li>`;
  });

  // FAQ accordion HTML
  let faqHtml = '';
  scenario.faq.forEach(f => {
    faqHtml += `
    <div style="border-bottom:1px solid #e5ded4; padding:16px 0;">
      <strong style="font-size:14.5px; color:#181716; display:block; margin-bottom:6px;">${f.question}</strong>
      <p style="font-size:13px; color:#6f6a65; margin:0; line-height:1.5;">${f.answer}</p>
    </div>`;
  });

  // Related scenarios HTML
  let relatedHtml = '';
  scenario.related_scenarios.forEach(rSlug => {
    const rel = getScenarioBySlug(rSlug);
    if (rel) {
      relatedHtml += `
      <a href="/use-cases/${rel.slug}" style="display:block; background:#fff; border:1px solid #e5ded4; border-radius:12px; padding:16px; text-decoration:none; color:inherit;">
        <span style="font-size:10px; font-weight:800; color:#71717a; text-transform:uppercase;">${rel.category_label}</span>
        <strong style="display:block; font-size:14px; color:#181716; margin:4px 0;">${rel.title}</strong>
        <span style="font-size:12px; color:#6f6a65;">${rel.short_description}</span>
      </a>`;
    }
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": scenario.title,
    "description": scenario.seo_description,
    "url": `https://aipp.dev/use-cases/${scenario.slug}`,
    "proficiencyLevel": "Intermediate",
    "publisher": {
      "@type": "Organization",
      "name": "AIPP Protocol",
      "url": "https://aipp.dev"
    }
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${scenario.seo_title}</title>
  <meta name="description" content="${scenario.seo_description}">
  <link rel="canonical" href="https://aipp.dev/use-cases/${scenario.slug}">
  <meta property="og:title" content="${scenario.title} — AIPP Use Case">
  <meta property="og:description" content="${scenario.short_description}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://aipp.dev/use-cases/${scenario.slug}">
  <link rel="icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    * { box-sizing: border-box; }
    body { margin:0; font-family:'Plus Jakarta Sans', -apple-system, sans-serif; background:#faf7f2; color:#181716; line-height:1.6; }
    .container { max-width:860px; margin:0 auto; padding:0 24px; }
    .breadcrumb { font-size:12px; color:#85817b; margin:24px 0 16px; }
    .breadcrumb a { color:inherit; text-decoration:none; }
    .header-box { background:#fff; border:1.5px solid #e5ded4; border-radius:20px; padding:32px; margin-bottom:32px; box-shadow:0 6px 20px rgba(0,0,0,0.03); }
    .header-box h1 { font-family:Georgia, serif; font-size:36px; font-weight:500; margin:12px 0; color:#181716; }
    .section-title { font-family:Georgia, serif; font-size:24px; font-weight:500; margin:36px 0 16px; color:#181716; }
    .flow-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:32px; }
    .code-block { background:#111; color:#f4f4f5; padding:18px; border-radius:12px; font-family:'JetBrains Mono', monospace; font-size:12.5px; overflow-x:auto; margin:16px 0 32px; }
    .boundaries { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:24px 0; }
    .box-does { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:14px; padding:20px; }
    .box-not { background:#fef2f2; border:1px solid #fecaca; border-radius:14px; padding:20px; }
    @media (max-width: 720px) {
      .header-box h1 { font-size:28px; }
      .boundaries { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  ${renderHeader()}
  <div class="container">
    <div class="breadcrumb">
      <a href="/">Home</a> &gt; <a href="/use-cases">Use Cases</a> &gt; <span>${scenario.title}</span>
    </div>

    <!-- Header Box -->
    <div class="header-box">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <span style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#71717a; background:#f4f4f5; padding:4px 10px; border-radius:12px;">${scenario.category_label}</span>
        ${renderTruthBadge(scenario.truth_level, scenario.truth_badge_text)}
      </div>
      <h1>${scenario.title}</h1>
      <p style="font-size:16px; color:#6f6a65; margin:0 0 16px 0;">${scenario.short_description}</p>
      
      <div style="font-size:12px; background:#f8f5ef; border-left:3px solid #f59e0b; padding:10px 14px; border-radius:6px; color:#524e4a;">
        <strong>Target Audience:</strong> ${scenario.target_user}
      </div>
    </div>

    <!-- The Problem -->
    <h2 class="section-title">The Real Problem</h2>
    <div style="background:#fff; border:1px solid #e5ded4; border-radius:14px; padding:24px; font-size:14.5px; color:#403d39;">
      <p style="margin:0 0 12px 0;">${scenario.problem}</p>
      <div style="font-size:13px; color:#71717a; font-style:italic;">
        <strong>Real-World Example:</strong> ${scenario.real_world_example}
      </div>
    </div>

    <!-- How AIPP Solves It -->
    <h2 class="section-title">How AIPP Solves It</h2>
    <p style="font-size:15px; color:#403d39;">${scenario.how_aipp_solves_it}</p>

    <!-- Payment Flow Diagram -->
    <h3 style="font-size:16px; margin:24px 0 12px 0;">Step-by-Step Payment Flow</h3>
    <div class="flow-grid">
      ${flowHtml}
    </div>

    <!-- What AIPP Does vs Does Not Do -->
    <h2 class="section-title">Scope &amp; Boundaries</h2>
    <div class="boundaries">
      <div class="box-does">
        <strong style="display:block; color:#065f46; font-size:14px; margin-bottom:12px;">What AIPP Does</strong>
        <ul style="margin:0; padding:0; list-style:none; font-size:13px; color:#166534;">
          ${doesHtml}
        </ul>
      </div>
      <div class="box-not">
        <strong style="display:block; color:#991b1b; font-size:14px; margin-bottom:12px;">What AIPP Does Not Do</strong>
        <ul style="margin:0; padding:0; list-style:none; font-size:13px; color:#991b1b;">
          ${doesNotHtml}
        </ul>
      </div>
    </div>

    <!-- Implementation Code -->
    <h2 class="section-title">Implementation Pattern</h2>
    <p style="font-size:14px; color:#6f6a65; margin-bottom:8px;">Below is the minimal implementation pattern using standard AIPP endpoints / SDK:</p>
    <div class="code-block">${scenario.example_code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

    <!-- Settlement Disclosure -->
    <div style="background:#fffdfa; border:1px solid #fcd34d; border-radius:12px; padding:16px; font-size:12.5px; color:#78350f; margin-bottom:32px;">
      <strong>⚡ Settlement Architecture Note:</strong><br>
      • <strong>Lightning Rail:</strong> In hosted Lightning flows, payments route through AIPP's Lightning gateway before net proceeds are automatically forwarded to your configured wallet address.<br>
      • <strong>Base USDC Rail:</strong> USDC transfers settle directly on-chain to your designated EVM wallet address.<br>
      • <strong>No Merchant Spending Balance:</strong> AIPP does not maintain a spendable merchant balance or require manual withdrawal steps.
    </div>

    <!-- Requirements & Limitations -->
    <h2 class="section-title">Requirements &amp; Limitations</h2>
    <ul style="font-size:13.5px; color:#403d39; padding-left:20px; margin-bottom:32px;">
      ${scenario.limitations.map(l => `<li style="margin-bottom:6px;">${l}</li>`).join('')}
    </ul>

    <!-- FAQ -->
    <h2 class="section-title">Frequently Asked Questions</h2>
    <div style="background:#fff; border:1px solid #e5ded4; border-radius:14px; padding:8px 24px; margin-bottom:48px;">
      ${faqHtml}
    </div>

    <!-- Related Scenarios -->
    ${scenario.related_scenarios.length > 0 ? `
    <h2 class="section-title">Related Use Cases</h2>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-bottom:48px;">
      ${relatedHtml}
    </div>` : ''}

    <!-- Persona-Specific CTA -->
    ${renderPersonaCta(scenario)}
  </div>
  ${renderFooter()}
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

export function renderSitemapXml(req: Request, res: Response): void {
  const baseUrl = 'https://aipp.dev';
  const now = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/docs.html</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/dashboard.html</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/legal.html</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/use-cases</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/store</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/store/freelance-designer-client-os</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

  SCENARIOS.forEach(s => {
    xml += `
  <url>
    <loc>${baseUrl}/use-cases/${s.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  });

  xml += `
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
}
