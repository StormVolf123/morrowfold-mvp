import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Sun,
  MessageCircle,
  Layers,
  ArrowUpRight,
  ArrowUp,
  Plus,
  Check,
  ChevronRight,
  Leaf,
  Settings,
  X,
  ArrowLeft,
  FileText,
  ShieldCheck,
  LogOut,
  Sparkles,
  BookOpen,
  Flag,
  CheckCheck,
  Download,
  Trash2,
} from "lucide-react";
import { api, configure, config, login, logout, signedIn } from "./client";
import { seed, type Item, type Kind } from "./domain";
import "./style.css";
function App() {
  const [ready, setReady] = useState(false),
    [authenticated, setAuthenticated] = useState(false),
    [items, setItems] = useState<Item[]>([]),
    [view, setView] = useState("today"),
    [selected, setSelected] = useState<string | null>(null),
    [modal, setModal] = useState(""),
    [editing, setEditing] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [scope, setScope] = useState(""),
    [message, setMessage] = useState(""),
    [conversation, setConversation] = useState<string | null>(null),
    [messages, setMessages] = useState<{ role: string; content: string }[]>([]),
    [brief, setBrief] = useState(false);
  const demo = ready && config?.mode === "preview";
  useEffect(() => {
    configure()
      .then(async () => {
        const ok = await signedIn();
        if (ok)
          setItems(
            config.mode === "preview"
              ? structuredClone(seed)
              : await api.list(),
          );
        setAuthenticated(ok);
        setReady(true);
      })
      .catch((e) => {
        setError(e.message);
        setReady(true);
      });
  }, []);
  useEffect(() => {
    if (!modal && !brief) return;
    const previous = document.activeElement as HTMLElement | null;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = document.querySelector(
      modal ? ".modal" : ".brief-overlay",
    ) as HTMLElement | null;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, textarea, select, a[href]",
        ) || [],
      );
    if (brief) focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const close = root?.querySelector<HTMLButtonElement>(".close");
        if (close && !close.disabled) close.click();
      }
      if (e.key === "Tab") {
        const list = focusable();
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [modal, brief]);
  const areas = items.filter((i) => i.kind === "area"),
    tasks = items.filter((i) => i.kind === "task"),
    memories = items.filter((i) => i.kind === "memory"),
    area = areas.find((i) => i.id === selected),
    drafts = items.filter((i) => i.kind === "draft");
  const areaName = (id: string) =>
    areas.find((i) => i.id === id)?.data.title || "All areas";
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(kind: Kind, data: Item["data"], original?: Item | null) {
    const next = demo
      ? {
          id: original?.id || crypto.randomUUID(),
          kind,
          data,
          version: (original?.version || 0) + 1,
        }
      : await api.save(kind, data, original?.id, original?.version);
    setItems((old) => [...old.filter((i) => i.id !== next.id), next]);
    return next;
  }
  function open(type: string, item?: Item) {
    setEditing(item || null);
    setModal(type);
  }
  function navigate(next: string) {
    setView(next);
    setSelected(null);
    setBrief(false);
    setError("");
  }
  function taskRow(t: Item) {
    return (
      <div className={"task " + (t.data.done ? "done" : "")} key={t.id}>
        <button
          className="check"
          aria-label={(t.data.done ? "Reopen " : "Complete ") + t.data.title}
          disabled={busy}
          onClick={() =>
            run(async () => {
              await save("task", { ...t.data, done: !t.data.done }, t);
            })
          }
        >
          {t.data.done && <Check size={14} />}
        </button>
        <button className="task-text" onClick={() => open("task", t)}>
          <strong>{t.data.title}</strong>
          <small>
            {areaName(t.data.area_id)}
            {t.data.due ? " · " + t.data.due : ""}
          </small>
        </button>
        <ChevronRight size={16} />
      </div>
    );
  }
  async function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = Object.fromEntries(fd);
    await run(async () => {
      if (modal === "draft") {
        if (demo)
          throw Error(
            "Connect the pilot to generate a real draft. Preview mode does not simulate AI.",
          );
        const result = await api.draft(String(data.area_id), String(data.job));
        setItems((old) => [...old, result]);
        setEditing(result);
        setModal("draft-edit");
        return;
      }
      if (modal === "draft-edit") {
        await save(
          "draft",
          {
            ...editing!.data,
            content: String(data.content),
            status: String(data.status),
          },
          editing,
        );
      } else
        await save(
          modal as Kind,
          {
            ...editing?.data,
            ...data,
            ...(modal === "task" ? { done: editing?.data.done || false } : {}),
          },
          editing,
        );
      setModal("");
    });
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    await run(async () => {
      if (demo)
        throw Error(
          "This is a design preview. Sign-in and the connected pilot are needed for real AI replies.",
        );
      const result = await api.chat(message, scope || null, conversation);
      setConversation(result.id);
      setMessages(result.data.messages);
      setItems((old) => [...old.filter((i) => i.id !== result.id), result]);
      setMessage("");
    });
  }
  const icon = (Icon: any) => <Icon size={20} strokeWidth={1.6} />;
  if (!ready)
    return (
      <div className="loading">
        <Leaf /> A little space to begin…
      </div>
    );
  if (!authenticated)
    return (
      <div className="welcome">
        <div className="orb" />
        <div className="brand">
          <Leaf /> morrowfold
        </div>
        <span className="eyebrow">A PRIVATE SPACE FOR YOUR AMBITIONS</span>
        <h1>
          A little closer.
          <br />
          Every day.
        </h1>
        <p>
          Bring the things that matter into focus.
          <br />
          An assistant that helps you move them forward.
        </p>
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get("code"));
            run(async () => {
              await login(code);
              setItems(await api.list());
              setAuthenticated(true);
            });
          }}
        >
          <label htmlFor="access-code">Your pilot access code</label>
          <input
            id="access-code"
            name="code"
            type="password"
            autoComplete="off"
            required
            placeholder="Enter your private invitation code"
          />
          <button className="primary" disabled={busy}>
            Enter your workspace <ArrowUpRight size={18} />
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("today");
          }}
        >
          <span className="brand-icon">
            <Leaf size={22} />
          </span>
          morrowfold
        </a>
        <span className="eyebrow">YOUR WORKSPACE</span>
        <nav>
          {[
            ["today", "Today", Sun],
            ["chat", "Chat", MessageCircle],
            ["areas", "My areas", Layers],
            ["memory", "Memory", BookOpen],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              className={view === key ? "active" : ""}
              onClick={() => navigate(String(key))}
            >
              {icon(Icon)}
              <span>{String(label)}</span>
              {view === key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="side-areas">
          <span className="eyebrow">WHAT MATTERS TO YOU</span>
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                navigate("areas");
                setSelected(a.id);
              }}
            >
              <span className={"dot " + a.data.theme} />
              {a.data.title}
            </button>
          ))}
          <button onClick={() => open("area")}>
            <Plus size={15} /> New area
          </button>
        </div>
        <div className="side-bottom">
          <div className="privacy">
            <ShieldCheck size={16} />
            <span>{demo ? "Sample workspace" : "Your private workspace"}</span>
          </div>
          <button className="profile" onClick={() => navigate("settings")}>
            <span className="avatar">{demo ? "A" : "Y"}</span>
            <span>
              {demo ? "Alex’s workspace" : "My workspace"}
              <small>{demo ? "Explore the preview" : "Pilot member"}</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            {selected ? (
              <>
                My areas <ChevronRight size={12} /> {area?.data.title}
              </>
            ) : (
              {
                today: "Your day, with intention",
                chat: "A little help along the way",
                areas: "Space for what matters",
                memory: "What your assistant knows",
                settings: "Your workspace",
              }[view]
            )}
          </span>
          <span className="status">
            <span />
            {demo ? "Design preview" : "Private pilot"}
          </span>
        </header>
        <div className="content" key={view + selected}>
          {demo && (
            <div className="preview-note">
              <span>
                Meet Morrowfold · Sample data, changes last until refresh.
              </span>
              <button onClick={() => navigate("settings")}>
                About this preview <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {view === "today" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {new Date()
                      .toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })
                      .toUpperCase()}
                  </span>
                  <h1>
                    {new Date().getHours() < 12
                      ? "Good morning"
                      : new Date().getHours() < 18
                        ? "Good afternoon"
                        : "Good evening"}
                    {demo ? ", Alex" : ""}
                    <span className="accent">.</span>
                  </h1>
                  <p>A little clarity. A meaningful next step.</p>
                </div>
                <button
                  className="round"
                  aria-label="Add a task"
                  onClick={() => open("task")}
                >
                  <Plus />
                </button>
              </div>
              <div className="today-grid">
                <button className="brief-card" onClick={() => setBrief(true)}>
                  <div className="landscape">
                    <i className="sun" />
                    <i className="hill hill-back" />
                    <i className="hill hill-front" />
                    <i className="hill hill-near" />
                  </div>
                  <div className="brief-copy">
                    <span className="eyebrow">YOUR DAILY PAUSE</span>
                    <h2>
                      A clearer picture.
                      <br />A calmer start.
                    </h2>
                    <p>
                      {tasks.filter((t) => !t.data.done).length} next steps
                      across {areas.length} areas.
                      <br />
                      Take a moment to find your focus.
                    </p>
                    <span className="glass-link">
                      Open your brief <ArrowUpRight size={17} />
                    </span>
                  </div>
                  <span className="brief-label">
                    <Sun size={15} /> Made for your day
                  </span>
                </button>
                <section className="focus-card">
                  <div className="section-label">
                    <span>
                      <Sparkles size={15} /> A LITTLE MOMENTUM
                    </span>
                    <span className="fold" />
                  </div>
                  <div className="paper-stack">
                    <div className="paper back" />
                    <div className="paper front">
                      <FileText size={22} />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="seal">
                      <Leaf size={19} />
                    </div>
                  </div>
                  <h2>
                    Your next chapter
                    <br />
                    starts with a first draft.
                  </h2>
                  <p>
                    Turn your experience into an application that sounds like
                    you.
                  </p>
                  <button className="text-button" onClick={() => open("draft")}>
                    Prepare an application <ArrowUpRight size={17} />
                  </button>
                </section>
              </div>
              <div className="section-heading">
                <h2>
                  Your areas <span>{areas.length}</span>
                </h2>
                <button onClick={() => navigate("areas")}>
                  See all <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="area-grid">
                {areas.slice(0, 3).map((a) => areaCard(a))}
                {areas.length === 0 && (
                  <button className="empty-area" onClick={() => open("area")}>
                    <Plus />
                    Create your first area
                  </button>
                )}
              </div>
              <div className="lower-grid">
                <section className="panel">
                  <div className="section-heading">
                    <h2>A few next steps</h2>
                    <button
                      aria-label="Add next step"
                      onClick={() => open("task")}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  {tasks
                    .slice()
                    .sort((a, b) => Number(a.data.done) - Number(b.data.done))
                    .slice(0, 5)
                    .map(taskRow)}
                  {tasks.length === 0 && (
                    <p className="empty">
                      One small step is a good place to start.
                    </p>
                  )}
                </section>
                <section className="reflection">
                  <span className="eyebrow">ROOM TO GROW</span>
                  <h2>
                    What would make
                    <br />
                    today feel worthwhile?
                  </h2>
                  <p>
                    You don’t need to move everything forward. Just something
                    that matters.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      navigate("chat");
                      setMessage(
                        "Help me choose one meaningful next step today.",
                      );
                    }}
                  >
                    Think it through <ArrowUpRight size={16} />
                  </button>
                  <Leaf className="reflection-leaf" size={100} />
                </section>
              </div>
            </>
          )}
          {view === "areas" && (
            <>
              {area ? (
                <>
                  <button
                    className="text-button"
                    onClick={() => setSelected(null)}
                  >
                    <ArrowLeft size={16} /> All areas
                  </button>
                  <div className={"area-hero " + area.data.theme}>
                    <div className="sculpture" />
                    <span className="eyebrow">YOUR AREA</span>
                    <h1>{area.data.title}</h1>
                    <p>{area.data.goal}</p>
                    <button
                      className="glass-link"
                      onClick={() => open("area", area)}
                    >
                      Edit area <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="section-heading">
                    <h2>Next steps</h2>
                    <button onClick={() => open("task")}>
                      <Plus size={18} /> Add task
                    </button>
                  </div>
                  <section className="panel">
                    {tasks
                      .filter((t) => t.data.area_id === area.id)
                      .map(taskRow)}
                    {!tasks.some((t) => t.data.area_id === area.id) && (
                      <p className="empty">What’s the first step?</p>
                    )}
                  </section>
                  <div className="section-heading">
                    <h2>Your work</h2>
                    <button
                      onClick={() => {
                        setScope(area.id);
                        setConversation(null);
                        setMessages([]);
                        navigate("chat");
                      }}
                    >
                      Talk about this area <ArrowUpRight size={16} />
                    </button>
                  </div>
                  {drafts
                    .filter((d) => d.data.area_id === area.id)
                    .map((d) => (
                      <button
                        className="document-row"
                        key={d.id}
                        onClick={() => open("draft-edit", d)}
                      >
                        <FileText />
                        <span>
                          <strong>{d.data.title}</strong>
                          <small>
                            {d.data.status} · Never sent automatically
                          </small>
                        </span>
                        <ChevronRight />
                      </button>
                    ))}
                  <button
                    className="document-row"
                    onClick={() => open("draft")}
                  >
                    <Plus size={20} /> Prepare an application draft
                  </button>
                </>
              ) : (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">YOUR PERSONAL LIBRARY</span>
                      <h1>Space to become.</h1>
                      <p>
                        Different ambitions. One place to move them forward.
                      </p>
                    </div>
                    <button className="primary" onClick={() => open("area")}>
                      <Plus size={17} /> New area
                    </button>
                  </div>
                  <div className="area-grid library">{areas.map(areaCard)}</div>
                </>
              )}
            </>
          )}
          {view === "chat" && (
            <div className="chat-layout">
              <div className="chat-top">
                <select
                  aria-label="Assistant scope"
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setMessages([]);
                    setConversation(null);
                  }}
                >
                  <option value="">All my areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.data.title}
                    </option>
                  ))}
                </select>
                <button
                  className="text-button"
                  onClick={() => {
                    setMessages([]);
                    setConversation(null);
                  }}
                >
                  <Plus size={16} /> New chat
                </button>
              </div>
              <div className="messages">
                {messages.length === 0 ? (
                  <div className="chat-empty">
                    <div className="assistant-orb">
                      <Leaf size={32} />
                    </div>
                    <span className="eyebrow">YOUR PERSONAL ASSISTANT</span>
                    <h1>Where shall we begin?</h1>
                    <p>A question, an ambition, or something on your mind.</p>
                    <div className="suggestions">
                      {[
                        "Help me plan my day",
                        "Think through my next career move",
                        "Make space for my goals",
                      ].map((s) => (
                        <button key={s} onClick={() => setMessage(s)}>
                          {s}
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={"message " + m.role}>
                      <small>{m.role === "user" ? "You" : "Morrowfold"}</small>
                      <p>{m.content}</p>
                    </div>
                  ))
                )}
              </div>
              <form className="composer" onSubmit={send}>
                <textarea
                  aria-label="Message your assistant"
                  placeholder="What’s on your mind?"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={4000}
                />
                <div>
                  <span>
                    <ShieldCheck size={13} />
                    {scope
                      ? "This area + shared memory"
                      : "All areas + your memory"}{" "}
                    · {demo ? "Preview only" : "Sent to Mistral when you send"}
                  </span>
                  <button
                    className="send"
                    aria-label="Send message"
                    disabled={busy || !message.trim()}
                  >
                    {busy ? "…" : <ArrowUp size={20} />}
                  </button>
                </div>
              </form>
              <p className="chat-footnote">
                Your assistant can help you think and draft. It cannot send
                messages or change your plans without you.
              </p>
              {items.some((i) => i.kind === "conversation") && (
                <details>
                  <summary>Previous conversations</summary>
                  {items
                    .filter((i) => i.kind === "conversation")
                    .map((i) => (
                      <button
                        className="document-row"
                        key={i.id}
                        onClick={() => {
                          setScope(i.data.area_id || "");
                          setConversation(i.id);
                          setMessages(i.data.messages);
                        }}
                      >
                        {i.data.title}
                      </button>
                    ))}
                </details>
              )}
            </div>
          )}
          {view === "memory" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">KNOWN, NOT ASSUMED</span>
                  <h1>A little more you.</h1>
                  <p>
                    Keep the context that makes your assistant useful. You
                    decide what stays.
                  </p>
                </div>
                <button className="primary" onClick={() => open("memory")}>
                  <Plus size={17} /> Add memory
                </button>
              </div>
              <div className="memory-grid">
                {memories.map((m) => (
                  <button
                    className="memory-card"
                    key={m.id}
                    onClick={() => open("memory", m)}
                  >
                    <BookOpen size={20} />
                    <span className="eyebrow">{areaName(m.data.area_id)}</span>
                    <h2>{m.data.title}</h2>
                    <p>{m.data.content}</p>
                    <span className="text-button">
                      Review memory <ArrowUpRight size={16} />
                    </span>
                  </button>
                ))}
              </div>
              {memories.length === 0 && (
                <p className="empty">
                  Tell your assistant about your preferences, experience, or
                  ambitions. Nothing is inferred and saved automatically.
                </p>
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ON YOUR TERMS</span>
                  <h1>Your space. Your say.</h1>
                </div>
              </div>
              <section className="panel settings">
                <ShieldCheck />
                <h2>
                  {demo
                    ? "You’re exploring the design preview"
                    : "Your private pilot workspace"}
                </h2>
                <p>
                  {demo
                    ? "The names and activities are fictional. Edits live in this tab’s memory and disappear on refresh. AI, accounts, and cloud storage are not active here."
                    : "Your workspace is stored through our API in PostgreSQL. Selected context goes to Mistral when you request assistance. Content is encrypted in storage, but the server can decrypt it; this is not end-to-end encryption."}
                </p>
                <p>
                  In this first version you can organise areas and tasks, curate
                  memory, and work with application drafts. Scheduled routines,
                  live news, wearable integrations, and sharing are planned—not
                  active.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(items, null, 2)], {
                      type: "application/json",
                    });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "morrowfold-workspace.json";
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  <Download size={16} /> Export my workspace
                </button>
                {!demo && (
                  <button className="text-button" onClick={() => logout()}>
                    <LogOut size={16} /> Sign out
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      {brief && (
        <div className="brief-overlay">
          <div className="landscape">
            <i className="sun" />
            <i className="hill hill-back" />
            <i className="hill hill-front" />
            <i className="hill hill-near" />
          </div>
          <button
            className="close round"
            aria-label="Close brief"
            onClick={() => setBrief(false)}
          >
            <X />
          </button>
          <div className="brief-body">
            <span className="eyebrow">A MOMENT FOR YOU</span>
            <h1>
              Start with
              <br />
              what matters.
            </h1>
            <p>
              You have {tasks.filter((t) => !t.data.done).length} open steps.
              Choose one that would make today a little better.
            </p>
            <section>
              {tasks
                .filter((t) => !t.data.done)
                .slice(0, 5)
                .map(taskRow)}
              {!tasks.some((t) => !t.data.done) && (
                <p>Space to breathe. Add a next step when you’re ready.</p>
              )}
            </section>
            <button
              className="primary"
              onClick={() => {
                setBrief(false);
                navigate("chat");
                setMessage("Help me prioritise my open tasks today.");
              }}
            >
              Plan with my assistant <ArrowUpRight size={16} />
            </button>
            <small>
              Based on your workspace · No connected calendar or live news yet
            </small>
          </div>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal("");
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button
              className="close"
              aria-label="Close dialog"
              disabled={busy}
              onClick={() => setModal("")}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2 id="dialog-title">
              {
                {
                  area: editing
                    ? "Shape this area"
                    : "Make room for an ambition",
                  task: editing ? "Your next step" : "One small next step",
                  memory: editing ? "Review your memory" : "A little context",
                  draft: "Your experience. Your words.",
                  "draft-edit": "Make it yours.",
                }[modal]
              }
            </h2>
            <form onSubmit={submitForm} key={modal + editing?.id}>
              {["area", "task", "memory"].includes(modal) && (
                <label>
                  {modal === "area" ? "Area name" : "Title"}
                  <input
                    autoFocus
                    name="title"
                    required
                    maxLength={120}
                    defaultValue={editing?.data.title || ""}
                    placeholder={
                      modal === "area"
                        ? "e.g. My first marathon"
                        : "Give it a clear name"
                    }
                  />
                </label>
              )}
              {modal === "area" && (
                <>
                  <label>
                    What are you working towards?
                    <textarea
                      name="goal"
                      required
                      maxLength={2000}
                      defaultValue={editing?.data.goal || ""}
                    />
                  </label>
                  <label>
                    Colour story
                    <select
                      name="theme"
                      defaultValue={editing?.data.theme || "forest"}
                    >
                      <option value="forest">Forest</option>
                      <option value="clay">Terracotta</option>
                      <option value="blue">Blue hour</option>
                    </select>
                  </label>
                </>
              )}
              {["task", "memory", "draft"].includes(modal) && (
                <label>
                  Area
                  <select
                    name="area_id"
                    required={modal !== "memory"}
                    defaultValue={
                      editing?.data.area_id || selected || scope || ""
                    }
                  >
                    <option value="">
                      {modal === "memory"
                        ? "Shared across my areas"
                        : "Choose an area"}
                    </option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.data.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {modal === "task" && (
                <label>
                  Target date (optional)
                  <input
                    type="date"
                    name="due"
                    defaultValue={editing?.data.due || ""}
                  />
                </label>
              )}
              {modal === "memory" && (
                <label>
                  What should your assistant know?
                  <textarea
                    name="content"
                    required
                    maxLength={4000}
                    rows={5}
                    defaultValue={editing?.data.content || ""}
                  />
                </label>
              )}
              {modal === "draft" && (
                <>
                  <p>
                    Your selected area and its memory will be used by Mistral.
                    Add verified experience to Memory first. The result stays
                    here for your review.
                  </p>
                  <label>
                    Paste the job description
                    <textarea
                      autoFocus
                      name="job"
                      rows={8}
                      required
                      maxLength={12000}
                      placeholder="Role, organisation, responsibilities, requirements…"
                    />
                  </label>
                  <small>No application will be sent.</small>
                </>
              )}
              {modal === "draft-edit" && (
                <>
                  <label>
                    Draft
                    <textarea
                      name="content"
                      rows={14}
                      required
                      maxLength={20000}
                      defaultValue={editing?.data.content}
                    />
                  </label>
                  <label>
                    Review status
                    <select name="status" defaultValue={editing?.data.status}>
                      <option value="draft">Draft</option>
                      <option value="reviewed">Reviewed by me</option>
                    </select>
                  </label>
                  <small>
                    Check every factual claim before using this draft. Export or
                    copy it to send yourself.
                  </small>
                </>
              )}
              <div className="form-footer">
                {editing && (
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        if (
                          editing.kind === "area" &&
                          items.some((i) => i.data.area_id === editing.id)
                        )
                          throw Error(
                            "Remove this area’s tasks, memory, drafts and chats before deleting it.",
                          );
                        if (!demo) await api.remove(editing);
                        setItems((old) =>
                          old.filter((i) => i.id !== editing.id),
                        );
                        setModal("");
                      })
                    }
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                )}
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Working…"
                    : modal === "draft"
                      ? "Prepare draft"
                      : "Save"}
                  <ArrowUpRight size={16} />
                </button>
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </form>
          </section>
        </div>
      )}
    </div>
  );
  function areaCard(a: Item) {
    const ts = tasks.filter((t) => t.data.area_id === a.id);
    return (
      <button
        className="area-card"
        key={a.id}
        onClick={() => {
          navigate("areas");
          setSelected(a.id);
        }}
      >
        <div className={"area-art " + a.data.theme}>
          <div className="sculpture" />
          <span className="art-icon">
            {a.data.theme === "forest" ? (
              <Flag size={19} />
            ) : a.data.theme === "clay" ? (
              <Sun size={19} />
            ) : (
              <BookOpen size={19} />
            )}
          </span>
          <span className="art-arrow">
            <ArrowUpRight size={19} />
          </span>
        </div>
        <div className="area-caption">
          <h3>{a.data.title}</h3>
          <span>
            {ts.filter((t) => t.data.done).length} of {ts.length} steps complete
          </span>
          <div className="progress">
            <i
              style={{
                width: ts.length
                  ? `${(ts.filter((t) => t.data.done).length / ts.length) * 100}%`
                  : "0%",
              }}
            />
          </div>
        </div>
      </button>
    );
  }
}
createRoot(document.getElementById("root")!).render(<App />);
