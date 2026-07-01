import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, ShadingType } from "docx";
import fs from "fs";
import path from "path";

// Color Palette for high-end professional appearance
const COLOR_PRIMARY = "1E293B";   // Dark Slate
const COLOR_ACCENT = "0EA5E9";    // Sky Blue
const COLOR_TEXT = "000000";      // Carbon text
const COLOR_LIGHT_BG = "F8FAFC";  // Soft off-white
const COLOR_MUTED = "64748B";     // Cool gray

// Font selection
const FONT_FAMILY = "Arial";

// Helper to create styled paragraphs
function createParagraph(text: string, options: { 
  bold?: boolean; 
  italic?: boolean; 
  size?: number; // half-points, e.g. 24 = 12pt
  color?: string; 
  spacingAfter?: number;
  spacingBefore?: number;
  bullet?: boolean;
} = {}) {
  return new Paragraph({
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: {
      after: options.spacingAfter ?? 120,
      before: options.spacingBefore ?? 0,
      line: 276, // 1.15 line spacing
    },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        italics: options.italic,
        size: options.size ?? 22, // default 11pt
        color: options.color ?? COLOR_TEXT,
        font: FONT_FAMILY,
      }),
    ],
  });
}

// Helper for title headings
function createHeading(text: string, level: any, options: { before?: number; after?: number } = {}) {
  let size = 28;
  let color = COLOR_PRIMARY;
  
  if (level === HeadingLevel.HEADING_1) {
    size = 32;
    color = COLOR_PRIMARY;
  } else if (level === HeadingLevel.HEADING_2) {
    size = 26;
    color = COLOR_ACCENT;
  } else if (level === HeadingLevel.HEADING_3) {
    size = 22;
    color = COLOR_MUTED;
  }

  return new Paragraph({
    heading: level,
    spacing: {
      before: options.before ?? 240,
      after: options.after ?? 120,
    },
    children: [
      new TextRun({
        text,
        bold: true,
        size,
        color,
        font: FONT_FAMILY,
      }),
    ],
  });
}

// Create the document
const doc = new Document({
  title: "Solutions and Collaterals Portal Specification",
  description: "Comprehensive software specification and developer guide for Solutions and Collaterals Portal",
  sections: [
    {
      properties: {},
      children: [
        // Title block
        new Paragraph({
          spacing: { before: 1000, after: 200 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "SOFTWARE REQUIREMENTS SPECIFICATION (SRS)",
              bold: true,
              size: 40,
              color: COLOR_PRIMARY,
              font: FONT_FAMILY,
            }),
          ],
        }),
        new Paragraph({
          spacing: { after: 1000 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "AND ARCHITECTURAL DESIGN DOCUMENT",
              bold: true,
              size: 28,
              color: COLOR_ACCENT,
              font: FONT_FAMILY,
            }),
          ],
        }),

        // Project metadata block (Table or aligned paragraphs)
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 2400 } }), // visual gap
        
        createParagraph("Project Name: Solutions and Collaterals Portal", { bold: true, size: 24, spacingAfter: 80 }),
        createParagraph("Version: 1.0.0", { size: 22, spacingAfter: 80, color: COLOR_MUTED }),
        createParagraph(`Date Created: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { size: 22, spacingAfter: 80, color: COLOR_MUTED }),
        createParagraph("Author: Principal Technical Architect", { size: 22, spacingAfter: 80, color: COLOR_MUTED }),
        createParagraph("Environment: AI Studio Sandboxed Enterprise Stack", { size: 22, spacingAfter: 480, color: COLOR_MUTED }),

        // Page break before Table of Contents or Executive Summary
        new Paragraph({ pageBreakBefore: true }),

        createHeading("1. Executive Summary", HeadingLevel.HEADING_1),
        createParagraph("The Solutions and Collaterals Portal is a high-octane enterprise application catalog and digital case-study hub designed to showcase company-engineered technical solutions. It solves the critical bottleneck of safely displaying functional systems while providing corporate marketing and client-facing business teams with interactive PDF/Word generation, detailed log transparency, and custom portals targeted at specific customer domains (e.g., retail, supply chain)."),
        createParagraph("By leveraging secure Corporate Email Verification, the portal ensures that client information and credentials remain secure. The system is enhanced with a fully integrated server-side Gemini 3.5 AI Engine to generate customized industry case studies from simple reference files and adjust site copy dynamically based on target portfolios."),

        createHeading("2. System Architecture & Directory Topology", HeadingLevel.HEADING_1),
        createParagraph("The application utilizes a robust, unified Full-Stack Architecture running on clean Node.js and TypeScript. It utilizes a Single-Page Application (SPA) client written in React 19 + Tailwind CSS, coupled to a highly performant API and static asset coordinator written in Express.js."),
        createParagraph("Below is the exact engineering directory tree representation of the codebase:"),
        
        // Tree listing
        createParagraph("├── /data/                  # Persistent data directory", { bold: true, bullet: true }),
        createParagraph("│   └── data-store.json    # JSON-based structured persistent database", { bullet: true }),
        createParagraph("├── /src/                  # React Frontend Application modules", { bold: true, bullet: true }),
        createParagraph("│   ├── /components/       # Isolated UI views and modals", { bullet: true }),
        createParagraph("│   │   ├── AccessWall.tsx               # Enterprise Corporate Email Gateway", { bullet: true }),
        createParagraph("│   │   ├── AdminSolutions.tsx           # Solutions catalog organizer", { bullet: true }),
        createParagraph("│   │   ├── AdminCollaterals.tsx         # AI Case Study writer engine", { bullet: true }),
        createParagraph("│   │   ├── AdminLogs.tsx                # Security audit and visitor telemetry view", { bullet: true }),
        createParagraph("│   │   └── ShellModals.tsx              # Interactive solution credentials prefill", { bullet: true }),
        createParagraph("│   ├── App.tsx            # Root application router and layout portal", { bullet: true }),
        createParagraph("│   ├── types.ts           # Unified TypeScript Interface Declarations", { bullet: true }),
        createParagraph("│   └── index.css          # Tailwind CSS global entry point", { bullet: true }),
        createParagraph("├── server.ts              # Custom full-stack Express.js & Vite API Gateway", { bold: true, bullet: true }),
        createParagraph("├── package.json           # Package descriptors, build paths and compiler modes", { bold: true, bullet: true }),
        createParagraph("└── tsconfig.json          # TypeScript static compiler configurations", { bold: true, bullet: true }),

        // Heading 2: Tech Stack
        createHeading("3. Detailed Technology Stack", HeadingLevel.HEADING_1),
        createParagraph("The system enforces strong typing and compiled consistency across both server and client modules.", { italic: true }),

        createParagraph("Frontend Stack (Client-Side):", { bold: true, color: COLOR_PRIMARY, spacingBefore: 120 }),
        createParagraph("• React 19: High-performance user interface views built with standard functional hooks, handling state transitions and context flows elegantly.", { bullet: true }),
        createParagraph("• Tailwind CSS v4: Comprehensive UI styling using atomic utility classes. The color guidelines apply a high-contrast charcoal black base, elegant deep slate borders, and crisp blue accents.", { bullet: true }),
        createParagraph("• Motion (Framer Motion API): Responsive, fluid layout transformations, subtle fade transitions, and micro-interactions on button and folder hovers.", { bullet: true }),
        createParagraph("• Lucide React: High-quality, unified responsive vector icons.", { bullet: true }),

        createParagraph("Backend Stack (Server-Side):", { bold: true, color: COLOR_PRIMARY, spacingBefore: 120 }),
        createParagraph("• Express.js & Node: Secure server listening on port 3000 hosting REST endpoints, mock file download handlers, and background files processor.", { bullet: true }),
        createParagraph("• Google Gen AI SDK: Official '@google/genai' SDK utilized to connect the server directly to Gemini APIs. Crucially, API keys are stored entirely server-side (`GEMINI_API_KEY`) ensuring no secrets are leaked to the client browser.", { bullet: true }),
        createParagraph("• TSX Compiler: Used to boot the TypeScript node engine cleanly in dev-modes without intermediate bundle delays.", { bullet: true }),
        createParagraph("• Esbuild Bundler: Compiled bundle engine configured to compile server assets into a standalone, compressed CJS module (`dist/server.cjs`) for low-latency cold-starts in containerized runtimes.", { bullet: true }),

        new Paragraph({ pageBreakBefore: true }),

        createHeading("4. System Features & Workflows", HeadingLevel.HEADING_1),
        
        createHeading("4.1 Corporate E-Mail Authentication (Access Wall)", HeadingLevel.HEADING_2),
        createParagraph("The user flow starts with an obligatory authentication boundary (AccessWall). Users cannot view any solutions or case study data without first submitting an authentic, verifiable work email address."),
        createParagraph("Access validation rules:", { bold: true, spacingBefore: 60 }),
        createParagraph("• Email format validator checking syntactic '@' structure.", { bullet: true }),
        createParagraph("• Domain-level exclusion checklist preventing consumer email addresses from logging in (Gmail, Hotmail, Yahoo, Outlook, AOL, Zoho, Proton etc.).", { bullet: true }),
        createParagraph("• Automatic creation of a persistent Visitor Log containing the email, resolved domain, and chronological entry timestamps upon successful validation.", { bullet: true }),

        createHeading("4.2 Interactive Solutions Catalog", HeadingLevel.HEADING_2),
        createParagraph("Once access is granted, the dashboard loads a clean catalog of engineered systems, custom portals, and web utilities. Each solution is represented as an interactive card including custom tech tags (e.g. Retail, Vision AI, ML Optimization). Clicking a solution displays a clear pre-launch information modal containing the prefilled operations credentials, safe descriptions, and a direct click-to-launch hyperlink, preventing the need for tedious manual copy-pasting of demo credentials."),

        createHeading("4.3 Case Study Generator (Collaterals Workspace)", HeadingLevel.HEADING_2),
        createParagraph("Provides a document vault containing customized business and execution cases. It is powered by Gemini 3.5 AI. Users can write high-level objectives, check corresponding file attachments (e.g., project briefs, deck outlines), and request Gemini to design an extensive executive-grade document complete with:"),
        createParagraph("• Corporate customer profile mapping.", { bullet: true }),
        createParagraph("• Pain point breakdowns detailing operational leaks.", { bullet: true }),
        createParagraph("• Interactive pipelines represented as ASCII-styled flow diagrams.", { bullet: true }),
        createParagraph("• Statistical financial results.", { bullet: true }),

        createHeading("4.4 AI-Powered Administration Suite", HeadingLevel.HEADING_2),
        createParagraph("A secure control room allowing admins to manage the entire portal dynamically:"),
        createParagraph("• Solution and Collateral CRUD Panel: Instantly create, disable, edit, and delete elements from the data store.", { bullet: true }),
        createParagraph("• Global Branding Copylisting: Write high-level focus prompts and ask Gemini to write professional marketing headlines for the portal dynamically.", { bullet: true }),
        createParagraph("• White-label Subdomain Routing: Set the site subdomain (e.g. 'retail', 'logistics') directly from the interface, which structures the external portal URL address.", { bullet: true }),

        new Paragraph({ pageBreakBefore: true }),

        createHeading("5. Database Schema & Data Models", HeadingLevel.HEADING_1),
        createParagraph("The database utilizes a local JSON-driven file store (`/data/data-store.json`) for file-safe, transactional operations in local environments, designed for rapid synchronization and easy migration to Firestore or Cloud SQL."),
        
        createHeading("5.1 Solution Interface Structure", HeadingLevel.HEADING_2),
        createParagraph("The following model outlines fields tracking target portals:"),
        createParagraph("id: string (Primary Key)", { bullet: true }),
        createParagraph("title: string (Full Title description)", { bullet: true }),
        createParagraph("thumbnail: string (Direct Unsplash/Asset vector CDN url)", { bullet: true }),
        createParagraph("url: string (Demoworkspace hyperlink direction)", { bullet: true }),
        createParagraph("credentialsDescription: string (Demonstration access instructions)", { bullet: true }),
        createParagraph("usernamePrefill: string (Optional Operations user profile)", { bullet: true }),
        createParagraph("passwordPrefill: string (Optional Operations user passcode)", { bullet: true }),
        createParagraph("tags: string[] (Array of domain tags filtering catalog)", { bullet: true }),
        createParagraph("createdAt: string (ISO Timestamp)", { bullet: true }),
        createParagraph("enabled: boolean (Visibility toggle across portal layouts)", { bullet: true }),

        createHeading("5.2 Collateral Case Study Structure", HeadingLevel.HEADING_2),
        createParagraph("The following model holds custom case materials generated in real time:"),
        createParagraph("id: string (Primary Key)", { bullet: true }),
        createParagraph("title: string (Target Business Case title)", { bullet: true }),
        createParagraph("thumbnail: string (Image indicator)", { bullet: true }),
        createParagraph("prompt: string (AI formatting context guidelines)", { bullet: true }),
        createParagraph("generatedContent: string (Markdown containing headers, lists and ascii diagrams)", { bullet: true }),
        createParagraph("uploadedFiles: Array<{ name: string, size: string, type: string }> (Audit list describing background assets)", { bullet: true }),
        createParagraph("createdAt: string (ISO Timestamp)", { bullet: true }),
        createParagraph("enabled: boolean (Visibility toggle)", { bullet: true }),

        createHeading("5.3 User Logging Structure", HeadingLevel.HEADING_2),
        createParagraph("Captures every action performed chronologically for complete enterprise logging transparency:"),
        createParagraph("id: string (Unique Log UUID)", { bullet: true }),
        createParagraph("email: string (The authenticated worker email address)", { bullet: true }),
        createParagraph("action: string (E.g. Code Launched, Study Created, Portal Initialized)", { bullet: true }),
        createParagraph("details: string (Specific details highlighting specific solution IDs or tags used)", { bullet: true }),
        createParagraph("date: string (ISO UTC Timestamp)", { bullet: true }),

        new Paragraph({ pageBreakBefore: true }),

        createHeading("6. API Gateway Interface Specs", HeadingLevel.HEADING_1),
        createParagraph("The backend mounts the following REST endpoints:"),

        // Table showing API
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: COLOR_PRIMARY },
                  children: [new Paragraph({ children: [new TextRun({ text: "Method", bold: true, color: "FFFFFF" })] })],
                  width: { size: 15, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  shading: { fill: COLOR_PRIMARY },
                  children: [new Paragraph({ children: [new TextRun({ text: "Endpoint", bold: true, color: "FFFFFF" })] })],
                  width: { size: 35, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  shading: { fill: COLOR_PRIMARY },
                  children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true, color: "FFFFFF" })] })],
                  width: { size: 50, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("GET")] }),
                new TableCell({ children: [createParagraph("/api/database")] }),
                new TableCell({ children: [createParagraph("Returns complete application state including Solutions, Collaterals, Logs, Branding, Subdomain.")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("POST")] }),
                new TableCell({ children: [createParagraph("/api/email-login")] }),
                new TableCell({ children: [createParagraph("Performs corporate domain check, grants session access, logs entry activity.")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("POST")] }),
                new TableCell({ children: [createParagraph("/api/log")] }),
                new TableCell({ children: [createParagraph("Logs user events (e.g. Solution Launch, Collateral Read).")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("POST")] }),
                new TableCell({ children: [createParagraph("/api/admin/solutions")] }),
                new TableCell({ children: [createParagraph("Carries out Solutions catalog CRUD adjustments (create, update, delete).")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("POST")] }),
                new TableCell({ children: [createParagraph("/api/admin/collaterals")] }),
                new TableCell({ children: [createParagraph("Carries out Collaterals vault CRUD adjustments.")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("POST")] }),
                new TableCell({ children: [createParagraph("/api/admin/generate-collateral")] }),
                new TableCell({ children: [createParagraph("Invokes Gemini AI API to compile reference documents into structured case studies.")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("POST")] }),
                new TableCell({ children: [createParagraph("/api/admin/generate-hero")] }),
                new TableCell({ children: [createParagraph("Uses Gemini AI to write promotional headline and copy for landing page context.")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("POST")] }),
                new TableCell({ children: [createParagraph("/api/admin/subdomain")] }),
                new TableCell({ children: [createParagraph("Updates white-label subdomain configuration and commits changes to store.")] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [createParagraph("GET")] }),
                new TableCell({ children: [createParagraph("/api/download/:filename")] }),
                new TableCell({ children: [createParagraph("Generates and returns signed, real mock enterprise archives representing backend source files.")] }),
              ],
            }),
          ],
        }),

        createHeading("7. Implementation & Deployment Guidelines", HeadingLevel.HEADING_1),
        createParagraph("To compile the application in a local desktop context or target container, follow these steps exactly:"),
        createParagraph("1. Unpack ZIP Archive: Extract all ZIP assets into a clean file directory.", { bullet: true }),
        createParagraph("2. Configure Environment: Create a `.env` file at the root modeling `.env.example` and populate your `GEMINI_API_KEY` of Google AI Studio.", { bullet: true }),
        createParagraph("3. Install Base Dependencies: Run `npm install` to download dependencies.", { bullet: true }),
        createParagraph("4. Local Development Boot: Execute `npm run dev` which triggers `tsx server.ts` and boots the system at localhost on port 3000.", { bullet: true }),
        createParagraph("5. Production Bundle Compile: Build the SPA and Express bundles concurrently using `npm run build` which bundles backend assets into `dist/server.cjs` and frontend screens into the `dist/` directory.", { bullet: true }),
        createParagraph("6. Production Launch: Start the micro-service container using `npm start` which fires up node on port 3000.", { bullet: true }),
      ],
    },
  ],
});

// Pack & Write file
Packer.toBuffer(doc).then((buffer) => {
  const outputPath = path.join(process.cwd(), "development_spec.docx");
  fs.writeFileSync(outputPath, buffer);
  console.log("----------------------------------------");
  console.log(`Word Document (.docx) compiled successfully: ${outputPath}`);
  console.log("----------------------------------------");
}).catch((err) => {
  console.error("Failed to generate DOCX file:", err);
});
