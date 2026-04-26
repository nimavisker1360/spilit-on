"use client";

import { useEffect, useMemo, useState } from "react";

import { WorkflowGuide } from "@/components/guide/workflow-guide";
import { useDashboardLanguage } from "@/components/layout/dashboard-language";
import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import {
  advanceWorkflowGuideStep,
  isWorkflowGuideDone,
  readWorkflowGuideStep,
  type WorkflowGuideStepKey,
  WORKFLOW_GUIDE_STEPS,
  writeWorkflowGuideStep
} from "@/lib/workflow-guide";

const ALL_TABLES_KEY = "__all_tables__";

type KitchenStatus = "PENDING" | "IN_PROGRESS" | "READY" | "SERVED" | "VOID";
type KitchenWorkflowStatus = Exclude<KitchenStatus, "VOID">;

const kitchenTransitionMap: Record<KitchenStatus, KitchenStatus[]> = {
  PENDING: ["IN_PROGRESS"],
  IN_PROGRESS: ["PENDING", "READY"],
  READY: ["IN_PROGRESS", "SERVED"],
  SERVED: [],
  VOID: []
};

function transitionButtonLabel(current: KitchenStatus, next: KitchenWorkflowStatus): string {
  if (current === "PENDING" && next === "IN_PROGRESS") {
    return "Start prep";
  }

  if (current === "IN_PROGRESS" && next === "PENDING") {
    return "Back to pending";
  }

  if (current === "IN_PROGRESS" && next === "READY") {
    return "Mark ready";
  }

  if (current === "READY" && next === "IN_PROGRESS") {
    return "Back to prep";
  }

  if (current === "READY" && next === "SERVED") {
    return "Mark served";
  }

  return kitchenStatusLabel(next);
}

function formatTicketPlacedAt(value: string): string {
  const stamp = new Date(value);
  const date = stamp.toLocaleDateString();
  const time = stamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return `${date} | ${time}`;
}

function formatTicketAge(value: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(value).getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;

  if (remainingMinutes === 0) {
    return `${diffHours}h`;
  }

  return `${diffHours}h ${remainingMinutes}m`;
}

type KitchenTicket = {
  id: string;
  itemName: string;
  quantity: number;
  status: KitchenStatus;
  note: string | null;
  createdAt: string;
  guest: {
    displayName: string;
  };
  order: {
    session: {
      table: {
        name: string;
      };
      branch: {
        name: string;
      };
    };
  };
};

async function fetchBoard(): Promise<KitchenTicket[]> {
  const response = await fetch("/api/kitchen", { cache: "no-store" });
  const json = (await response.json()) as { data?: KitchenTicket[]; error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Failed to load kitchen board");
  }

  return json.data ?? [];
}

async function patchStatus(orderItemId: string, status: KitchenStatus) {
  const response = await fetch(`/api/kitchen/items/${orderItemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });

  const json = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Failed to update kitchen status");
  }
}

function statusClass(status: KitchenStatus): string {
  if (status === "PENDING") {
    return "badge badge-status-pending";
  }

  if (status === "IN_PROGRESS") {
    return "badge badge-status-progress";
  }

  if (status === "READY") {
    return "badge badge-status-ready";
  }

  if (status === "SERVED") {
    return "badge badge-status-served";
  }

  return "badge";
}

function kitchenStatusLabel(status: KitchenStatus): string {
  if (status === "IN_PROGRESS") {
    return "In progress";
  }

  return status.charAt(0) + status.slice(1).toLowerCase();
}

function buttonClassForStatus(status: KitchenWorkflowStatus): string {
  if (status === "IN_PROGRESS") {
    return "secondary";
  }

  if (status === "SERVED") {
    return "warn";
  }

  return "";
}

export default function KitchenDashboardPage() {
  const { t } = useDashboardLanguage();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTableFilter, setActiveTableFilter] = useState<string>(ALL_TABLES_KEY);
  const [guideStep, setGuideStep] = useState<WorkflowGuideStepKey | null>(null);
  const [isGuideInitialized, setIsGuideInitialized] = useState(false);

  const tableGroups = useMemo(() => {
    const grouped = new Map<
      string,
      { tableName: string; branchName: string; total: number; pending: number }
    >();

    for (const ticket of tickets) {
      const tableName = ticket.order.session.table.name;
      const branchName = ticket.order.session.branch.name;
      const key = `${branchName}::${tableName}`;
      const current = grouped.get(key) ?? { tableName, branchName, total: 0, pending: 0 };

      current.total += 1;
      if (ticket.status === "PENDING") {
        current.pending += 1;
      }

      grouped.set(key, current);
    }

    return Array.from(grouped.entries()).map(([key, value]) => ({ key, ...value }));
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    if (activeTableFilter === ALL_TABLES_KEY) {
      return tickets;
    }

    return tickets.filter(
      (ticket) => `${ticket.order.session.branch.name}::${ticket.order.session.table.name}` === activeTableFilter
    );
  }, [activeTableFilter, tickets]);

  useEffect(() => {
    if (activeTableFilter === ALL_TABLES_KEY) {
      return;
    }

    const stillExists = tableGroups.some((group) => group.key === activeTableFilter);
    if (!stillExists) {
      setActiveTableFilter(ALL_TABLES_KEY);
    }
  }, [activeTableFilter, tableGroups]);

  async function loadTickets() {
    setError("");

    try {
      const data = await fetchBoard();
      setTickets(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load kitchen board");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();

    const timer = window.setInterval(loadTickets, 8000);
    return () => window.clearInterval(timer);
  }, []);

  useRealtimeEvents({
    role: "kitchen",
    onEvent: () => {
      void loadTickets();
    }
  });

  async function handleStatus(orderItemId: string, status: KitchenStatus) {
    setBusyId(orderItemId);
    setError("");

    try {
      await patchStatus(orderItemId, status);
      if (status === "IN_PROGRESS") {
        setGuideStep((currentStep) => (currentStep === "kitchen-start-prep" ? advanceWorkflowGuideStep(currentStep) : currentStep));
      }
      if (status === "READY") {
        setGuideStep((currentStep) => (currentStep === "kitchen-mark-ready" ? advanceWorkflowGuideStep(currentStep) : currentStep));
      }
      if (status === "SERVED") {
        setGuideStep((currentStep) => {
          if (currentStep !== "kitchen-mark-served") {
            return currentStep;
          }

          writeWorkflowGuideStep("cashier-calculate");
          window.location.assign("/cashier");
          return "cashier-calculate";
        });
        return;
      }
      await loadTickets();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const lanes: Array<{
    status: KitchenStatus;
    title: string;
    description: string;
  }> = [
    {
      status: "PENDING",
      title: "Waiting",
      description: "New items that still need to enter prep."
    },
    {
      status: "IN_PROGRESS",
      title: "In prep",
      description: "Items actively being prepared."
    },
    {
      status: "READY",
      title: "Ready",
      description: "Items ready for waiter pickup or delivery."
    },
    {
      status: "SERVED",
      title: "Served",
      description: "Items marked served and no longer active."
    }
  ];

  const pendingCount = tickets.filter((ticket) => ticket.status === "PENDING").length;
  const inProgressCount = tickets.filter((ticket) => ticket.status === "IN_PROGRESS").length;
  const readyCount = tickets.filter((ticket) => ticket.status === "READY").length;
  const servedCount = tickets.filter((ticket) => ticket.status === "SERVED").length;
  const oldestActiveTicket = filteredTickets
    .filter((ticket) => ticket.status === "PENDING" || ticket.status === "IN_PROGRESS" || ticket.status === "READY")
    .reduce<KitchenTicket | null>((oldest, ticket) => {
      if (!oldest) {
        return ticket;
      }

      return new Date(ticket.createdAt).getTime() < new Date(oldest.createdAt).getTime() ? ticket : oldest;
    }, null);
  const activeBoardCount = pendingCount + inProgressCount + readyCount;
  const localizedTransitionButtonLabel = (current: KitchenStatus, next: KitchenWorkflowStatus) => {
    const label = transitionButtonLabel(current, next);
    if (label === "Start prep") return t("Start prep", "Hazirlamayi baslat");
    if (label === "Back to pending") return t("Back to pending", "Bekleyene geri al");
    if (label === "Mark ready") return t("Mark ready", "Hazir olarak isaretle");
    if (label === "Back to prep") return t("Back to prep", "Hazirlamaya geri al");
    if (label === "Mark served") return t("Mark served", "Servis edildi olarak isaretle");
    return label;
  };
  const localizedLaneTitle = (title: string) => {
    if (title === "Waiting") return t("Waiting", "Bekleyen");
    if (title === "In prep") return t("In prep", "Hazirlaniyor");
    if (title === "Ready") return t("Ready", "Hazir");
    if (title === "Served") return t("Served", "Servis edildi");
    return title;
  };
  const localizedLaneDescription = (description: string) => {
    if (description === "New items that still need to enter prep.") return t(description, "Henuz hazirlama asamasina girmemis yeni urunler.");
    if (description === "Items actively being prepared.") return t(description, "Aktif olarak hazirlanan urunler.");
    if (description === "Items ready for waiter pickup or delivery.") return t(description, "Garson teslimi veya servis icin hazir urunler.");
    if (description === "Items marked served and no longer active.") return t(description, "Servis edildi olarak isaretlenen ve artik aktif olmayan urunler.");
    return description;
  };
  const localizedKitchenStatus = (status: KitchenStatus) =>
    status === "IN_PROGRESS"
      ? t("In progress", "Hazirlaniyor")
      : status === "PENDING"
        ? t("Pending", "Bekleyen")
        : status === "READY"
          ? t("Ready", "Hazir")
          : status === "SERVED"
            ? t("Served", "Servis edildi")
            : t("Void", "Iptal");
  const isGuideStepSatisfied = useMemo(() => {
    if (guideStep === "kitchen-start-prep") return inProgressCount > 0 || readyCount > 0 || servedCount > 0;
    if (guideStep === "kitchen-mark-ready") return readyCount > 0 || servedCount > 0;
    if (guideStep === "kitchen-mark-served") return servedCount > 0;
    if (guideStep === "kitchen-cashier") return true;
    return false;
  }, [guideStep, inProgressCount, readyCount, servedCount]);

  useEffect(() => {
    if (isGuideInitialized || loading || typeof window === "undefined") {
      return;
    }

    if (isWorkflowGuideDone()) {
      setGuideStep(null);
      setIsGuideInitialized(true);
      return;
    }

    const storedStep = readWorkflowGuideStep();

    if (storedStep === "waiter-kitchen") {
      setGuideStep(advanceWorkflowGuideStep("waiter-kitchen"));
      setIsGuideInitialized(true);
      return;
    }

    if (storedStep === "kitchen-cashier") {
      writeWorkflowGuideStep("cashier-calculate");
      window.location.assign("/cashier");
      setIsGuideInitialized(true);
      return;
    }

    if (
      storedStep === "kitchen-start-prep" ||
      storedStep === "kitchen-mark-ready" ||
      storedStep === "kitchen-mark-served"
    ) {
      setGuideStep(storedStep);
    } else {
      setGuideStep(null);
    }

    setIsGuideInitialized(true);
  }, [isGuideInitialized, loading]);

  const kitchenGuideConfig =
    guideStep === "kitchen-start-prep"
      ? {
          targetId: "workflow-kitchen-waiting",
          title: t("Start preparation", "Hazirlamayi baslat"),
          description: t("Move a waiting ticket into prep.", "Bekleyen bir fisi hazirlama asamasina tasiyin."),
          confirmLabel: t("Prep already started", "Hazirlama zaten basladi"),
          skipLabel: t("Skip this step", "Bu adimi gec")
        }
      : guideStep === "kitchen-mark-ready"
        ? {
            targetId: "workflow-kitchen-in-progress",
            title: t("Mark the ticket ready", "Fisi hazir olarak isaretle"),
            description: t("Move one item from prep into ready.", "Bir urunu hazirlama asamasindan hazira tasiyin."),
            confirmLabel: t("An item is already ready", "Bir urun zaten hazir"),
            skipLabel: t("Skip this step", "Bu adimi gec")
          }
        : guideStep === "kitchen-mark-served"
          ? {
              targetId: "workflow-kitchen-ready",
              title: t("Mark the item served", "Urunu servis edildi olarak isaretle"),
              description: t("Mark a ready item as served to close the kitchen loop.", "Mutfak dongusunu tamamlamak icin hazir bir urunu servis edildi olarak isaretleyin."),
              confirmLabel: t("An item is already served", "Bir urun zaten servis edildi"),
              skipLabel: t("Skip this step", "Bu adimi gec")
            }
          : guideStep === "kitchen-cashier"
            ? {
                targetId: "workflow-nav-cashier",
                title: t("Go to cashier", "Kasiyer ekranina gec"),
                description: t("Continue in cashier to calculate the check and collect payment.", "Hesabi hesaplamak ve odemeyi almak icin kasiyerde devam edin."),
                confirmLabel: t("Open cashier screen", "Kasiyer ekranini ac"),
                skipLabel: t("Skip this step", "Bu adimi gec")
              }
            : null;

  return (
    <div className="kitchen-page stack-md">
      {guideStep && kitchenGuideConfig ? (
        <WorkflowGuide
          stepIndex={WORKFLOW_GUIDE_STEPS.indexOf(guideStep)}
          totalSteps={WORKFLOW_GUIDE_STEPS.length}
          targetId={kitchenGuideConfig.targetId}
          title={kitchenGuideConfig.title}
          description={kitchenGuideConfig.description}
          confirmLabel={kitchenGuideConfig.confirmLabel}
          skipLabel={kitchenGuideConfig.skipLabel}
          isSatisfied={isGuideStepSatisfied}
          onConfirm={() => {
            if (guideStep === "kitchen-mark-served") {
              writeWorkflowGuideStep("cashier-calculate");
              window.location.assign("/cashier");
              return;
            }

            if (guideStep === "kitchen-cashier") {
              setGuideStep((currentStep) => (currentStep === "kitchen-cashier" ? advanceWorkflowGuideStep(currentStep) : currentStep));
              window.location.assign("/cashier");
              return;
            }

            setGuideStep((currentStep) => (currentStep === guideStep ? advanceWorkflowGuideStep(currentStep) : currentStep));
          }}
          onSkip={() => {
            if (guideStep === "kitchen-mark-served") {
              writeWorkflowGuideStep("cashier-calculate");
              window.location.assign("/cashier");
              return;
            }

            if (guideStep === "kitchen-cashier") {
              setGuideStep((currentStep) => (currentStep === "kitchen-cashier" ? advanceWorkflowGuideStep(currentStep) : currentStep));
              window.location.assign("/cashier");
              return;
            }

            setGuideStep((currentStep) => (currentStep === guideStep ? advanceWorkflowGuideStep(currentStep) : currentStep));
          }}
        />
      ) : null}

      <section className="panel dashboard-hero kitchen-hero stack-md">
        <div className="section-head kitchen-hero-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">{t("Kitchen flow", "Mutfak akisi")}</p>
            <h2>{t("Kitchen board", "Mutfak panosu")}</h2>
            <p className="panel-subtitle">{t("Workflow remains unchanged: pending to in progress to ready to served.", "Akis degismez: bekleyenden hazirlaniyora, hazirdan servis edilene.")}</p>
          </div>
          <button type="button" className="kitchen-refresh-btn" onClick={loadTickets}>
            {t("Refresh", "Yenile")}
          </button>
        </div>

        <div className="dashboard-stat-grid kitchen-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Waiting", "Bekleyen")}</p>
            <p className="dashboard-stat-value">{pendingCount}</p>
            <p className="dashboard-stat-note">{t("Tickets not started yet.", "Henuz baslanmamis fisler.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("In prep", "Hazirlaniyor")}</p>
            <p className="dashboard-stat-value">{inProgressCount}</p>
            <p className="dashboard-stat-note">{t("Items currently being prepared.", "Su anda hazirlanan urunler.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Ready", "Hazir")}</p>
            <p className="dashboard-stat-value">{readyCount}</p>
            <p className="dashboard-stat-note">{t("Awaiting handoff.", "Teslim bekliyor.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Served", "Servis edildi")}</p>
            <p className="dashboard-stat-value">{servedCount}</p>
            <p className="dashboard-stat-note">{t("Items marked served in this refresh.", "Bu yenilemede servis edildi olarak isaretlenen urunler.")}</p>
          </article>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">{t("Loading live kitchen tickets.", "Canli mutfak fisleri yukleniyor.")}</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
        </div>
      </section>

      <section className="panel dashboard-briefing-panel kitchen-briefing-panel">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">{t("Kitchen script", "Mutfak akisi")}</p>
            <h3>{t("Show momentum, not just ticket lists", "Sadece fisleri degil, akisin ivmesini gosterin")}</h3>
            <p className="panel-subtitle">
              {t(
                "This board works best in the demo when you narrate the queue: new ticket arrives, prep starts, pickup is ready, and the waiter closes the loop.",
                "Bu pano demoda en iyi sonucu sirayi anlattiginizda verir: yeni fis gelir, hazirlama baslar, teslim hazir olur ve garson donguyu kapatir."
              )}
            </p>
          </div>
        </div>

        <div className="dashboard-story-grid dashboard-story-grid--three">
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">01</span>
            <h4>{t("Queue incoming demand", "Gelen talebi siraya alin")}</h4>
            <p>
              {pendingCount > 0
                ? t(
                    `${pendingCount} ticket(s) are waiting to enter prep across ${tableGroups.length} active table group(s).`,
                    `${tableGroups.length} aktif masa grubunda hazirlamaya girmeyi bekleyen ${pendingCount} fis var.`
                  )
                : t("No waiting tickets right now, so the queue is under control.", "Su anda bekleyen fis yok; kuyruk kontrol altinda.")}
            </p>
            <span className="dashboard-story-meta">{t("This is the moment where the kitchen proves live order intake.", "Mutfak canli siparis alimini burada kanitlar.")}</span>
          </article>
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">02</span>
            <h4>{t("Move work through prep", "Hazirlama asamasini ilerletin")}</h4>
            <p>
              {inProgressCount > 0
                ? t(
                    `${inProgressCount} ticket(s) are already in prep and can be moved forward from this board.`,
                    `${inProgressCount} fis zaten hazirlaniyor ve bu panodan ileri tasinabilir.`
                  )
                : t("Start prep on any waiting item to demonstrate real-time kitchen action.", "Gercek zamanli mutfak aksiyonunu gostermek icin bekleyen bir urunde hazirlamayi baslatin.")}
            </p>
            <span className="dashboard-story-meta">{t("Status changes here are reflected in the waiter and cashier roles.", "Buradaki durum degisiklikleri garson ve kasiyer rollerine de yansir.")}</span>
          </article>
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">03</span>
            <h4>{t("Hand off with confidence", "Guvenle teslim edin")}</h4>
            <p>
              {readyCount > 0
                ? t(
                    `${readyCount} ticket(s) are ready for pickup, so the handoff story is already visible.`,
                    `${readyCount} fis teslim almaya hazir; bu yuzden teslim hikayesi zaten gorunur durumda.`
                  )
                : t("Mark an item ready to show pickup and service completion in the next step.", "Sonraki adimda teslim ve servis tamamlanmasini gostermek icin bir urunu hazir olarak isaretleyin.")}
            </p>
            <span className="dashboard-story-meta">{t("Ready and served states make the workflow feel complete in front of the client.", "Hazir ve servis edildi durumlari, musterinin onunde akisi tamamlanmis hissettirir.")}</span>
          </article>
        </div>

        <div className="dashboard-pulse-strip">
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Board focus", "Pano odagi")}</span>
            <strong className="dashboard-pulse-value">
              {activeTableFilter === ALL_TABLES_KEY
                ? t("All live tables", "Tum canli masalar")
                : filteredTickets[0]
                  ? t(`Table ${filteredTickets[0].order.session.table.name}`, `Masa ${filteredTickets[0].order.session.table.name}`)
                  : t("No active table", "Aktif masa yok")}
            </strong>
            <span className="dashboard-pulse-meta">
              {activeTableFilter === ALL_TABLES_KEY ? t(`${tableGroups.length} table group(s) visible`, `${tableGroups.length} masa grubu gorunuyor`) : t("Filtered board for a single table.", "Tek masa icin filtrelenmis pano.")}
            </span>
          </article>
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Oldest active ticket", "En eski aktif fis")}</span>
            <strong className="dashboard-pulse-value">{oldestActiveTicket ? formatTicketAge(oldestActiveTicket.createdAt) : t("None", "Yok")}</strong>
            <span className="dashboard-pulse-meta">
              {oldestActiveTicket
                ? `${oldestActiveTicket.itemName} for ${oldestActiveTicket.guest.displayName}`
                : t("There are no pending, in-progress, or ready tickets right now.", "Su anda bekleyen, hazirlanan veya hazir fis yok.")}
            </span>
          </article>
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Active workload", "Aktif yuk")}</span>
            <strong className="dashboard-pulse-value">{activeBoardCount}</strong>
            <span className="dashboard-pulse-meta">
              {readyCount > 0 ? t(`${readyCount} ready for pickup`, `${readyCount} teslime hazir`) : t("Push a ticket through the board to show momentum.", "Ivme gostermek icin bir fisi pano icinde ilerletin.")}
            </span>
          </article>
        </div>
      </section>

      {tableGroups.length > 0 ? (
        <div className="table-filter-bar" role="tablist" aria-label={t("Filter by table", "Masaya gore filtrele")}>
          <button
            type="button"
            className={`table-filter-chip${activeTableFilter === ALL_TABLES_KEY ? " is-active" : ""}`}
            onClick={() => setActiveTableFilter(ALL_TABLES_KEY)}
            aria-pressed={activeTableFilter === ALL_TABLES_KEY}
          >
            <span>{t("All tables", "Tum masalar")}</span>
            <span className="table-filter-chip-count">{tickets.length}</span>
          </button>
          {tableGroups.map((group) => {
            const isActive = activeTableFilter === group.key;

            return (
              <button
                key={group.key}
                type="button"
                className={`table-filter-chip${isActive ? " is-active" : ""}${group.pending > 0 ? " has-pending" : ""}`}
                onClick={() => setActiveTableFilter(group.key)}
                aria-pressed={isActive}
                title={`${group.branchName} - Table ${group.tableName}`}
              >
                <span>{t(`Table ${group.tableName}`, `Masa ${group.tableName}`)}</span>
                <span className="table-filter-chip-count">{group.total}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <section className="ticket-board">
        {lanes.map((lane) => {
          const laneTickets = filteredTickets.filter((ticket) => ticket.status === lane.status);

          return (
            <article
              key={lane.status}
              className="panel ticket-lane"
              data-workflow-guide-id={
                lane.status === "PENDING"
                  ? "workflow-kitchen-waiting"
                  : lane.status === "IN_PROGRESS"
                    ? "workflow-kitchen-in-progress"
                    : lane.status === "READY"
                      ? "workflow-kitchen-ready"
                      : undefined
              }
            >
              <div className="ticket-lane-head">
                <div className="ticket-lane-copy">
                  <h3>{localizedLaneTitle(lane.title)}</h3>
                  <p className="helper-text">{localizedLaneDescription(lane.description)}</p>
                </div>
                <span className={statusClass(lane.status)}>{laneTickets.length}</span>
              </div>

              {laneTickets.length === 0 ? (
                <p className="empty empty-state">{t(`No tickets in ${lane.title.toLowerCase()}.`, `${localizedLaneTitle(lane.title).toLowerCase()} alaninda fis yok.`)}</p>
              ) : (
                <div className="ticket-lane-list">
                  {laneTickets.map((ticket) => (
                    <article key={ticket.id} className="ticket-card">
                      <div className="ticket-card-main">
                        <div className="ticket-card-head">
                          <div className="ticket-card-title">
                            <h4>{ticket.itemName}</h4>
                            <p className="entity-summary">
                              {ticket.order.session.branch.name} \u2022 {t(`Table ${ticket.order.session.table.name}`, `Masa ${ticket.order.session.table.name}`)}
                            </p>
                          </div>
                          <div className="badge-row">
                            <span className="badge badge-outline">{t("Qty", "Adet")} {ticket.quantity}</span>
                            <span className={statusClass(ticket.status)}>{localizedKitchenStatus(ticket.status)}</span>
                          </div>
                        </div>

                        <div className="ticket-meta-grid">
                          <div className="detail-card">
                            <span className="detail-label">{t("Guest", "Misafir")}</span>
                            <span className="detail-value">{ticket.guest.displayName}</span>
                          </div>
                          <div className="detail-card">
                            <span className="detail-label">{t("Queued", "Bekleme")}</span>
                            <span className="detail-value">{formatTicketAge(ticket.createdAt)}</span>
                          </div>
                          <div className="detail-card">
                            <span className="detail-label">{t("Placed at", "Gelis saati")}</span>
                            <span className="detail-value">{formatTicketPlacedAt(ticket.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="ticket-card-side">
                        {ticket.note ? (
                          <div className="helper-panel ticket-note-panel">
                            <p className="detail-label">{t("Kitchen note", "Mutfak notu")}</p>
                            <p className="helper-text ticket-note-text">{ticket.note}</p>
                          </div>
                        ) : (
                          <div className="ticket-note-empty ticket-note-panel">
                            <p className="helper-text">{t("No kitchen note", "Mutfak notu yok")}</p>
                          </div>
                        )}

                        <div className="ticket-actions">
                          {kitchenTransitionMap[ticket.status]
                            .filter((next): next is KitchenWorkflowStatus => next !== "VOID")
                            .map((next) => (
                              <button
                                key={`${ticket.id}-${next}`}
                                type="button"
                                className={`ticket-action-btn ${buttonClassForStatus(next)}`.trim()}
                                disabled={busyId === ticket.id}
                                onClick={() => handleStatus(ticket.id, next)}
                              >
                                {localizedTransitionButtonLabel(ticket.status, next)}
                              </button>
                            ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
