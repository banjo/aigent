import { createServer } from "node:http";

type PrdTask = {
    id: string;
    title: string;
    description: string;
    subtasks: string[];
    priority: number;
    passes: boolean;
    notes: string;
};

type Prd = {
    project: string;
    branchName: string;
    description: string;
    tasks: PrdTask[];
};

type TokenUsage = {
    total: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
        write: number;
        read: number;
    };
};

type Usage = {
    tokens: TokenUsage;
    cost: number;
};

export type RunStatus = {
    featureName: string;
    featureDescription: string;
    repositoryRoot: string;
    featureDirectory: string;
    maxIterations: number;
    currentIteration: number;
    currentTask: string | undefined;
    status: "starting" | "running" | "complete" | "limit_reached" | "error";
    message: string;
    prd: Prd;
    usageTotal: Usage;
    lastIterationUsage: Usage;
    startedAt: string;
    updatedAt: string;
};

export type StatusServer = {
    url: string;
    update: (nextStatus: RunStatus) => void;
    close: () => Promise<void>;
};

const json = (value: unknown): string => JSON.stringify(value);

const createHtml = (): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aigent Ralph Loop</title>
  <style>
    :root { color-scheme: dark; --bg: #0b1020; --panel: rgba(255,255,255,.08); --panel-strong: rgba(255,255,255,.13); --text: #f7f2ea; --muted: #a9b0c6; --accent: #8be9c7; --warn: #ffd166; --bad: #ff6b6b; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: radial-gradient(circle at 10% 10%, rgba(139,233,199,.18), transparent 34rem), radial-gradient(circle at 85% 20%, rgba(109,95,255,.24), transparent 30rem), var(--bg); }
    main { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 24px; }
    h1 { margin: 0; font-size: clamp(2rem, 6vw, 4.8rem); letter-spacing: -.08em; line-height: .9; }
    h2 { margin: 0 0 14px; font-size: .82rem; color: var(--muted); text-transform: uppercase; letter-spacing: .16em; }
    .subtitle { margin: 12px 0 0; max-width: 720px; color: var(--muted); font-size: 1.05rem; }
    .pill { padding: 8px 12px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(255,255,255,.07); color: var(--accent); white-space: nowrap; }
    .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
    .card { border: 1px solid rgba(255,255,255,.12); border-radius: 28px; padding: 22px; background: linear-gradient(145deg, var(--panel), rgba(255,255,255,.04)); box-shadow: 0 24px 80px rgba(0,0,0,.22); backdrop-filter: blur(18px); }
    .hero { grid-column: span 7; min-height: 260px; display: flex; flex-direction: column; justify-content: space-between; }
    .usage { grid-column: span 5; }
    .tasks { grid-column: span 8; }
    .meta { grid-column: span 4; }
    .number { font-size: clamp(2rem, 5vw, 4.4rem); font-weight: 800; letter-spacing: -.06em; }
    .muted { color: var(--muted); }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 20px; }
    .usage .stats { grid-template-columns: repeat(2, 1fr); }
    .stat { border-radius: 20px; padding: 16px; background: var(--panel-strong); }
    .stat b { display: block; font-size: 1.5rem; margin-bottom: 4px; }
    .bar { height: 12px; border-radius: 999px; background: rgba(255,255,255,.1); overflow: hidden; margin: 16px 0; }
    .bar span { display: block; height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--accent), #a78bfa); transition: width .25s ease; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    li { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: 18px; background: rgba(255,255,255,.06); }
    .dot { width: 10px; height: 10px; margin-top: 6px; border-radius: 50%; background: var(--warn); flex: none; }
    .done .dot { background: var(--accent); }
    .done { opacity: .58; }
    code { color: #d7ccff; word-break: break-word; }
    @media (max-width: 860px) { header { flex-direction: column; } .hero, .usage, .tasks, .meta { grid-column: 1 / -1; } .stats { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Ralph loop</h1>
        <p class="subtitle" id="description">Waiting for status...</p>
      </div>
      <div class="pill" id="status">starting</div>
    </header>
    <section class="grid">
      <article class="card hero">
        <div>
          <h2>Current Task</h2>
          <div class="number" id="current-task">-</div>
          <p class="muted" id="message">Booting status server.</p>
        </div>
        <div>
          <div class="bar"><span id="progress-bar"></span></div>
          <div class="stats">
            <div class="stat"><b id="iteration">0/0</b><span class="muted">Iteration</span></div>
            <div class="stat"><b id="remaining">0</b><span class="muted">Remaining tasks</span></div>
            <div class="stat"><b id="complete">0</b><span class="muted">Complete tasks</span></div>
          </div>
        </div>
      </article>
      <article class="card usage">
        <h2>Token Usage</h2>
        <div class="number" id="tokens">0</div>
        <p class="muted"><span id="cost">$0.00</span> total cost</p>
        <div class="stats">
          <div class="stat"><b id="input">0</b><span class="muted">Input</span></div>
          <div class="stat"><b id="output">0</b><span class="muted">Output</span></div>
          <div class="stat"><b id="reasoning">0</b><span class="muted">Reasoning</span></div>
          <div class="stat"><b id="cache-read">0</b><span class="muted">Cache read</span></div>
          <div class="stat"><b id="cache-write">0</b><span class="muted">Cache write</span></div>
        </div>
      </article>
      <article class="card tasks">
        <h2>Tasks</h2>
        <ul id="tasks"></ul>
      </article>
      <article class="card meta">
        <h2>Run Details</h2>
        <p><span class="muted">Feature</span><br><strong id="feature"></strong></p>
        <p><span class="muted">Repository</span><br><code id="repo"></code></p>
        <p><span class="muted">Updated</span><br><span id="updated"></span></p>
      </article>
    </section>
  </main>
  <script>
    const fmt = new Intl.NumberFormat('en-US');
    const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
    const text = (id, value) => { document.getElementById(id).textContent = value; };
    const refresh = async () => {
      const res = await fetch('/status', { cache: 'no-store' });
      const data = await res.json();
      const tasks = data.prd.tasks;
      const done = tasks.filter(task => task.passes).length;
      const remaining = tasks.length - done;
      const usage = data.usageTotal;
      text('description', data.featureDescription);
      text('status', data.status);
      text('current-task', data.currentTask || 'No remaining task');
      text('message', data.message);
      text('iteration', data.currentIteration + '/' + data.maxIterations);
      text('remaining', fmt.format(remaining));
      text('complete', fmt.format(done));
      text('tokens', fmt.format(usage.tokens.total));
      text('cost', usd.format(usage.cost));
      text('input', fmt.format(usage.tokens.input));
      text('output', fmt.format(usage.tokens.output));
      text('reasoning', fmt.format(usage.tokens.reasoning));
      text('cache-read', fmt.format(usage.tokens.cache.read));
      text('cache-write', fmt.format(usage.tokens.cache.write));
      text('feature', data.featureName);
      text('repo', data.repositoryRoot);
      text('updated', new Date(data.updatedAt).toLocaleString());
      document.getElementById('progress-bar').style.width = tasks.length ? ((done / tasks.length) * 100) + '%' : '0%';
      document.getElementById('tasks').innerHTML = tasks.map(task => '<li class="' + (task.passes ? 'done' : '') + '"><span class="dot"></span><div><strong>' + task.id + ': ' + task.title + '</strong><br><span class="muted">Priority ' + task.priority + '</span></div></li>').join('');
    };
    refresh();
    setInterval(refresh, 1500);
  </script>
</body>
</html>`;

export const createStatusServer = async (initialStatus: RunStatus): Promise<StatusServer> => {
    let status = initialStatus;
    const html = createHtml();
    const server = createServer((request, response) => {
        if (request.url === "/status") {
            response.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            });
            response.end(json(status));
            return;
        }

        response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
        });
        response.end(html);
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", rejectPromise);
            resolvePromise();
        });
    });

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    return {
        url: `http://127.0.0.1:${port}`,
        update(nextStatus) {
            status = nextStatus;
        },
        close() {
            return new Promise<void>(resolvePromise => {
                server.close(() => resolvePromise());
            });
        },
    };
};
