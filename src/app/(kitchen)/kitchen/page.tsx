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

  return next;
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

  return (
    <div className="stack-md">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Kitchen board</h2>
            <p className="meta">Workflow: PENDING -&gt; IN_PROGRESS -&gt; READY -&gt; SERVED.</p>
          </div>
          <button type="button" onClick={loadTickets}>
            Refresh
          </button>
        </div>
        {loading ? <p className="meta">Loading...</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="grid-2">
        {tickets.length === 0 ? <p className="empty">No active kitchen tickets.</p> : null}

        {tickets.map((ticket) => (
          <article key={ticket.id} className="form-card stack-md">
            <div className="section-head">
              <strong>
                {ticket.order.session.branch.name} - {ticket.order.session.table.name}
              </strong>
              <span className={statusClass(ticket.status)}>{ticket.status}</span>
            </div>

            <p>
              <strong>{ticket.itemName}</strong> x{ticket.quantity}
            </p>
            <p className="meta">Guest: {ticket.guest.displayName}</p>
            {ticket.note ? <p className="meta">Note: {ticket.note}</p> : null}
            <p className="meta">{new Date(ticket.createdAt).toLocaleString()}</p>

            <div className="grid-3">
              {kitchenTransitionMap[ticket.status]
                .filter((next): next is KitchenWorkflowStatus => next !== "VOID")
                .map((next) => (
                  <button
                    key={`${ticket.id}-${next}`}
                    type="button"
                    className={buttonClassForStatus(next)}
                    disabled={busyId === ticket.id}
                    onClick={() => handleStatus(ticket.id, next)}
                  >
                    {transitionButtonLabel(ticket.status, next)}
                  </button>
                ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
