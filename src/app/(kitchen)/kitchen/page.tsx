"use client";

import { useEffect, useState } from "react";

import { useRealtimeEvents } from "@/hooks/use-realtime-events";

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
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  return (
    <div className="kitchen-page stack-md">
      <section className="panel dashboard-hero kitchen-hero stack-md">
        <div className="section-head kitchen-hero-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Kitchen flow</p>
            <h2>Kitchen board</h2>
            <p className="panel-subtitle">Workflow remains unchanged: pending to in progress to ready to served.</p>
          </div>
          <button type="button" className="kitchen-refresh-btn" onClick={loadTickets}>
            Refresh
          </button>
        </div>

        <div className="dashboard-stat-grid kitchen-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Waiting</p>
            <p className="dashboard-stat-value">{pendingCount}</p>
            <p className="dashboard-stat-note">Tickets not started yet.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">In prep</p>
            <p className="dashboard-stat-value">{inProgressCount}</p>
            <p className="dashboard-stat-note">Items currently being prepared.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Ready</p>
            <p className="dashboard-stat-value">{readyCount}</p>
            <p className="dashboard-stat-note">Awaiting handoff.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Served</p>
            <p className="dashboard-stat-value">{servedCount}</p>
            <p className="dashboard-stat-note">Items marked served in this refresh.</p>
          </article>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Loading live kitchen tickets.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
        </div>
      </section>

      <section className="ticket-board">
        {lanes.map((lane) => {
          const laneTickets = tickets.filter((ticket) => ticket.status === lane.status);

          return (
            <article key={lane.status} className="panel ticket-lane">
              <div className="ticket-lane-head">
                <div className="ticket-lane-copy">
                  <h3>{lane.title}</h3>
                  <p className="helper-text">{lane.description}</p>
                </div>
                <span className={statusClass(lane.status)}>{laneTickets.length}</span>
              </div>

              {laneTickets.length === 0 ? (
                <p className="empty empty-state">No tickets in {lane.title.toLowerCase()}.</p>
              ) : (
                <div className="ticket-lane-list">
                  {laneTickets.map((ticket) => (
                    <article key={ticket.id} className="ticket-card">
                      <div className="ticket-card-main">
                        <div className="ticket-card-head">
                          <div className="ticket-card-title">
                            <h4>{ticket.itemName}</h4>
                            <p className="entity-summary">
                              {ticket.order.session.branch.name} \u2022 Table {ticket.order.session.table.name}
                            </p>
                          </div>
                          <div className="badge-row">
                            <span className="badge badge-outline">Qty {ticket.quantity}</span>
                            <span className={statusClass(ticket.status)}>{kitchenStatusLabel(ticket.status)}</span>
                          </div>
                        </div>

                        <div className="ticket-meta-grid">
                          <div className="detail-card">
                            <span className="detail-label">Guest</span>
                            <span className="detail-value">{ticket.guest.displayName}</span>
                          </div>
                          <div className="detail-card">
                            <span className="detail-label">Queued</span>
                            <span className="detail-value">{formatTicketAge(ticket.createdAt)}</span>
                          </div>
                          <div className="detail-card">
                            <span className="detail-label">Placed at</span>
                            <span className="detail-value">{formatTicketPlacedAt(ticket.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="ticket-card-side">
                        {ticket.note ? (
                          <div className="helper-panel ticket-note-panel">
                            <p className="detail-label">Kitchen note</p>
                            <p className="helper-text ticket-note-text">{ticket.note}</p>
                          </div>
                        ) : (
                          <div className="ticket-note-empty ticket-note-panel">
                            <p className="helper-text">No kitchen note</p>
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
                                {transitionButtonLabel(ticket.status, next)}
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
