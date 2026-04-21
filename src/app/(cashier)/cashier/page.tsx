"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import { formatTryCurrency } from "@/lib/currency";

type Guest = {
  id: string;
  displayName: string;
};

type OpenSession = {
  id: string;
  openedAt: string;
  readyToCloseAt: string | null;
  table: {
    name: string;
    code: string;
  };
  branch: {
    id: string;
    name: string;
  };
  guests: Guest[];
};

type InvoiceSplitMode = "FULL_BY_ONE" | "EQUAL" | "BY_GUEST_ITEMS";
type PaymentSessionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "EXPIRED";
type PaymentShareStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";
type CashierPaymentShareAction =
  | "PAY_BY_CASH"
  | "PAY_BY_CARD"
  | "SEND_ONLINE_LINK"
  | "COMPLETE_PENDING_PAYMENT"
  | "MARK_PAYMENT_FAILED";

type InvoiceResponse = {
  data: {
    id: string;
    createdAt: string;
    splitMode: InvoiceSplitMode;
    total: string;
    lines: Array<{
      id: string;
      label: string;
      amount: string;
      itemName: string | null;
      quantity: number | null;
      unitPrice: string | null;
      guest: Guest | null;
    }>;
    splits: Array<{
      id: string;
      payerLabel: string;
      amount: string;
      guest: Guest | null;
    }>;
  };
  error?: string;
};

type PaymentShare = {
  id: string;
  payerLabel: string;
  amount: string;
  tip: string;
  status: PaymentShareStatus;
  provider: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
  guest: Guest | null;
};

type PaymentSession = {
  id: string;
  invoiceId: string;
  status: PaymentSessionStatus;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  currency: string;
  shares: PaymentShare[];
  session: {
    id: string;
    status: "OPEN" | "CLOSED";
    closedAt: string | null;
    readyToCloseAt: string | null;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    table: {
      id: string;
      name: string;
      code: string;
    } | null;
  } | null;
};

type PaymentSessionResponse = {
  data: {
    created: boolean;
    paymentSession: PaymentSession;
  };
  error?: string;
};

type PaymentShareActionResponse = {
  data: {
    action: CashierPaymentShareAction;
    message: string;
    paymentSession: PaymentSession;
    paymentShare: PaymentShare;
  };
  error?: string;
};

type CashierReceiptLine = {
  id: string;
  label: string;
  amount: string;
  itemName: string | null;
  quantity: number | null;
  unitPrice: string | null;
  guestId: string | null;
  guestName: string | null;
};

type CashierReceiptShare = {
  id: string;
  payerLabel: string;
  guestId: string | null;
  guestName: string | null;
  amount: string;
  tip: string;
  totalCharged: string;
  status: PaymentShareStatus;
  provider: string | null;
  providerPaymentId: string | null;
  paidAt: string | null;
};

type CashierReceiptPayment = {
  id: string;
  guestId: string | null;
  guestName: string | null;
  amount: string;
  currency: string;
  method: string;
  status: string;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
};

type CashierReceipt = {
  id: string;
  invoiceId: string;
  sessionId: string;
  splitMode: InvoiceSplitMode;
  status: PaymentSessionStatus;
  currency: string;
  total: string;
  paidAmount: string;
  remainingAmount: string;
  tipAmount: string;
  collectedAmount: string;
  createdAt: string;
  paidAt: string;
  branch: {
    id: string;
    name: string;
  } | null;
  table: {
    id: string;
    name: string;
    code: string;
  } | null;
  guests: Guest[];
  lines: CashierReceiptLine[];
  shares: CashierReceiptShare[];
  payments: CashierReceiptPayment[];
};

type ReceiptsResponse = {
  data?: CashierReceipt[];
  error?: string;
};

const percentageFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US");
}

function formatShortTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatSessionLabel(session: OpenSession): string {
  return `${session.branch.name} | Table ${session.table.name} | Open check`;
}

function formatSessionSummary(session: OpenSession): string {
  return `Table ${session.table.name} | Opened ${formatShortTime(session.openedAt)}`;
}

function formatInvoiceNumber(invoiceId: string, createdAt?: string): string {
  const stamp = createdAt ? new Date(createdAt) : new Date();
  const year = String(stamp.getFullYear());
  const month = String(stamp.getMonth() + 1).padStart(2, "0");
  const day = String(stamp.getDate()).padStart(2, "0");
  const suffix = invoiceId.replace(/[^a-z0-9]/gi, "").slice(-3).toUpperCase().padStart(3, "0");

  return `INV-${year}${month}${day}-${suffix}`;
}

function splitModeLabel(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Full bill";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "By guest items";
  }

  return "Equal split";
}

function splitModeDescription(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "The entire check is assigned to one guest.";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Each guest pays only for their own ordered items.";
  }

  return "The total check is split equally among table guests.";
}

function splitModeHelper(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Best when one person pays the full bill by a single card or cash payment.";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Best for flows where each guest pays for their own items.";
  }

  return "Best for fast checkout when groups want an equal split.";
}

function formatStatusLabel(value: string): string {
  if (value === "OPEN") {
    return "Open";
  }

  if (value === "PARTIALLY_PAID") {
    return "Partially paid";
  }

  if (value === "PAID") {
    return "Paid";
  }

  if (value === "FAILED") {
    return "Failed";
  }

  if (value === "EXPIRED") {
    return "Expired";
  }

  if (value === "UNPAID") {
    return "Unpaid";
  }

  if (value === "PENDING") {
    return "Pending";
  }

  if (value === "CANCELLED") {
    return "Cancelled";
  }

  return value;
}

function paymentShareStatusBadgeClass(status: PaymentShareStatus): string {
  if (status === "PAID") {
    return "badge-status-paid-payment";
  }

  if (status === "PENDING") {
    return "badge-status-pending-payment";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "badge-danger";
  }

  return "badge-status-unpaid";
}

function paymentSessionStatusBadgeClass(status: PaymentSessionStatus): string {
  if (status === "PAID") {
    return "badge-status-paid-payment";
  }

  if (status === "PARTIALLY_PAID") {
    return "badge-status-progress";
  }

  return "badge-status-open";
}

function paymentProviderLabel(provider: string): string {
  if (provider === "CASH_DESK") {
    return "Cash desk";
  }

  if (provider === "CARD_POS") {
    return "Card POS";
  }

  if (provider === "MOCK_ONLINE_LINK") {
    return "Online payment link";
  }

  return formatStatusLabel(provider);
}

function formatPercentage(value: number): string {
  return `${percentageFormatter.format(value)}%`;
}

function resolveInvoiceLineQuantity(line: { quantity: number | null; label: string }): number {
  if (typeof line.quantity === "number" && Number.isInteger(line.quantity) && line.quantity > 0) {
    return line.quantity;
  }

  const labelMatch = line.label.match(/\sx(\d+)$/i);

  if (!labelMatch) {
    return 1;
  }

  const parsed = Number.parseInt(labelMatch[1], 10);

  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

async function fetchSessions(): Promise<OpenSession[]> {
  const response = await fetch("/api/sessions", { cache: "no-store" });
  const json = (await response.json()) as { data?: OpenSession[]; error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Could not load sessions");
  }

  return json.data ?? [];
}

async function fetchReceipts(): Promise<CashierReceipt[]> {
  const response = await fetch("/api/cashier/receipts", { cache: "no-store" });
  const json = (await response.json()) as ReceiptsResponse;

  if (!response.ok) {
    throw new Error(json.error || "Could not load receipt archive");
  }

  return json.data ?? [];
}

function formatOptionalDateTime(value: string | null | undefined): string {
  return value ? formatDateTime(value) : "";
}

function formatGuestList(guests: Guest[]): string {
  return guests.map((guest) => guest.displayName).join(", ");
}

function formatFileDate(value = new Date()): string {
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}`;
}

function sanitizeFileToken(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function buildReceiptWorkbook(receipts: CashierReceipt[]) {
  const workbook = XLSX.utils.book_new();

  const receiptRows = receipts.map((receipt) => ({
    "Receipt No": formatInvoiceNumber(receipt.invoiceId, receipt.createdAt),
    "Invoice ID": receipt.invoiceId,
    Branch: receipt.branch?.name ?? "",
    Table: receipt.table?.name ?? "",
    "Table Code": receipt.table?.code ?? "",
    "Split Mode": splitModeLabel(receipt.splitMode),
    "Subtotal TRY": Number(receipt.total),
    "Tip TRY": Number(receipt.tipAmount),
    "Collected TRY": Number(receipt.collectedAmount),
    Currency: receipt.currency,
    Status: formatStatusLabel(receipt.status),
    "Created At": formatDateTime(receipt.createdAt),
    "Paid At": formatDateTime(receipt.paidAt),
    Guests: formatGuestList(receipt.guests),
    "Line Count": receipt.lines.length,
    "Payment Count": receipt.payments.length
  }));

  const lineRows = receipts.flatMap((receipt) =>
    receipt.lines.map((line) => ({
      "Receipt No": formatInvoiceNumber(receipt.invoiceId, receipt.createdAt),
      Branch: receipt.branch?.name ?? "",
      Table: receipt.table?.name ?? "",
      Guest: line.guestName ?? "",
      Item: line.itemName ?? line.label,
      Quantity: line.quantity ?? "",
      "Unit Price TRY": line.unitPrice ? Number(line.unitPrice) : "",
      "Line Amount TRY": Number(line.amount)
    }))
  );

  const shareRows = receipts.flatMap((receipt) =>
    receipt.shares.map((share) => ({
      "Receipt No": formatInvoiceNumber(receipt.invoiceId, receipt.createdAt),
      Branch: receipt.branch?.name ?? "",
      Table: receipt.table?.name ?? "",
      Payer: share.payerLabel,
      Guest: share.guestName ?? "",
      "Share Amount TRY": Number(share.amount),
      "Tip TRY": Number(share.tip),
      "Total Charged TRY": Number(share.totalCharged),
      Status: formatStatusLabel(share.status),
      Method: share.provider ? paymentProviderLabel(share.provider) : "",
      Reference: share.providerPaymentId ?? "",
      "Paid At": formatOptionalDateTime(share.paidAt)
    }))
  );

  const paymentRows = receipts.flatMap((receipt) =>
    receipt.payments.map((payment) => ({
      "Receipt No": formatInvoiceNumber(receipt.invoiceId, receipt.createdAt),
      Branch: receipt.branch?.name ?? "",
      Table: receipt.table?.name ?? "",
      Guest: payment.guestName ?? "",
      Amount: Number(payment.amount),
      Currency: payment.currency,
      Method: paymentProviderLabel(payment.method),
      Status: formatStatusLabel(payment.status),
      Reference: payment.reference ?? "",
      "Paid At": formatOptionalDateTime(payment.paidAt ?? payment.createdAt)
    }))
  );

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(receiptRows), "Receipts");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lineRows), "Line items");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(shareRows), "Payment shares");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(paymentRows), "Payments");

  return workbook;
}

function writeReceiptsExcel(receipts: CashierReceipt[], fileName: string) {
  const workbook = buildReceiptWorkbook(receipts);
  XLSX.writeFile(workbook, fileName);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function receiptFileName(receipt: CashierReceipt, extension: "html" | "xlsx"): string {
  const receiptNumber = formatInvoiceNumber(receipt.invoiceId, receipt.createdAt);
  const tableName = receipt.table?.name ? `-${receipt.table.name}` : "";

  return `${sanitizeFileToken(`${receiptNumber}${tableName}`)}.${extension}`;
}

function buildPaperReceiptHtml(receipt: CashierReceipt): string {
  const receiptNumber = formatInvoiceNumber(receipt.invoiceId, receipt.createdAt);
  const branchName = receipt.branch?.name ?? "Restaurant";
  const tableName = receipt.table?.name ?? "-";
  const guests = formatGuestList(receipt.guests);
  const itemRows = receipt.lines
    .map((line) => {
      const itemName = line.itemName ?? line.label;
      const quantity = line.quantity ?? 1;
      const unitPrice = line.unitPrice ? formatTryCurrency(line.unitPrice) : "";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(itemName)}</strong>
            <span>${escapeHtml(line.guestName ?? "")}</span>
          </td>
          <td>${escapeHtml(quantity)}</td>
          <td>${escapeHtml(unitPrice)}</td>
          <td>${escapeHtml(formatTryCurrency(line.amount))}</td>
        </tr>`;
    })
    .join("");
  const paymentRows = receipt.shares
    .map(
      (share) => `
        <div class="payment-row">
          <div>
            <strong>${escapeHtml(share.payerLabel)}</strong>
            <span>${escapeHtml(share.provider ? paymentProviderLabel(share.provider) : "Payment")}</span>
          </div>
          <strong>${escapeHtml(formatTryCurrency(share.totalCharged))}</strong>
        </div>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(receiptNumber)}</title>
  <style>
    @page { margin: 5mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f4f4;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.35;
    }
    .receipt {
      width: 80mm;
      max-width: 100%;
      margin: 16px auto;
      padding: 14px 12px;
      background: #fff;
      border: 1px solid #ddd;
    }
    .center { text-align: center; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 18px; letter-spacing: 0; }
    h2 { font-size: 13px; margin-top: 4px; font-weight: 700; }
    .meta { color: #444; font-size: 11px; margin-top: 2px; }
    .rule { border-top: 1px dashed #555; margin: 10px 0; }
    .kv {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 10px;
      margin-top: 4px;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      border-bottom: 1px solid #111;
      padding: 0 0 4px;
      text-align: right;
      font-size: 10px;
    }
    th:first-child, td:first-child { text-align: left; }
    td {
      padding: 6px 0;
      text-align: right;
      vertical-align: top;
      border-bottom: 1px dotted #bbb;
      font-size: 11px;
    }
    td strong, td span { display: block; }
    td span { color: #555; font-size: 10px; margin-top: 1px; }
    .totals {
      display: grid;
      gap: 5px;
      margin-top: 8px;
      font-size: 12px;
    }
    .total-row, .payment-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: start;
    }
    .grand-total {
      border-top: 1px solid #111;
      padding-top: 7px;
      font-size: 15px;
      font-weight: 800;
    }
    .payment-row { margin-top: 6px; }
    .payment-row span {
      display: block;
      color: #555;
      font-size: 10px;
    }
    .footer { margin-top: 12px; font-size: 11px; }
    .print-actions {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin: 14px auto;
      width: 80mm;
      max-width: 100%;
    }
    .print-actions button {
      border: 0;
      border-radius: 6px;
      background: #111;
      color: #fff;
      cursor: pointer;
      padding: 8px 12px;
      font-weight: 700;
    }
    @media print {
      body { background: #fff; }
      .receipt { margin: 0; border: 0; width: 100%; padding: 0; }
      .print-actions { display: none; }
    }
  </style>
</head>
<body>
  <main class="receipt">
    <section class="center">
      <h1>${escapeHtml(branchName)}</h1>
      <h2>Payment receipt</h2>
      <p class="meta">${escapeHtml(receiptNumber)}</p>
    </section>

    <div class="rule"></div>

    <section class="kv">
      <span>Table</span><strong>${escapeHtml(tableName)}</strong>
      <span>Table code</span><strong>${escapeHtml(receipt.table?.code ?? "-")}</strong>
      <span>Paid at</span><strong>${escapeHtml(formatDateTime(receipt.paidAt))}</strong>
      <span>Split</span><strong>${escapeHtml(splitModeLabel(receipt.splitMode))}</strong>
      ${guests ? `<span>Guests</span><strong>${escapeHtml(guests)}</strong>` : ""}
    </section>

    <div class="rule"></div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <section class="totals">
      <div class="total-row"><span>Subtotal</span><strong>${escapeHtml(formatTryCurrency(receipt.total))}</strong></div>
      <div class="total-row"><span>Tip</span><strong>${escapeHtml(formatTryCurrency(receipt.tipAmount))}</strong></div>
      <div class="total-row grand-total"><span>Total paid</span><strong>${escapeHtml(formatTryCurrency(receipt.collectedAmount))}</strong></div>
    </section>

    <div class="rule"></div>

    <section>
      <strong>Payments</strong>
      ${paymentRows}
    </section>

    <div class="rule"></div>

    <p class="footer center">Thank you.</p>
  </main>
  <div class="print-actions">
    <button type="button" onclick="window.print()">Print receipt</button>
  </div>
</body>
</html>`;
}

function downloadPaperReceipt(receipt: CashierReceipt) {
  const blob = new Blob([buildPaperReceiptHtml(receipt)], { type: "text/html;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = receiptFileName(receipt, "html");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function CashierDashboardPage() {
  const [sessions, setSessions] = useState<OpenSession[]>([]);
  const [receipts, setReceipts] = useState<CashierReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const [exportError, setExportError] = useState("");
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState("");
  const [invoice, setInvoice] = useState<InvoiceResponse["data"] | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [paymentSessionNotice, setPaymentSessionNotice] = useState("");
  const [paymentSessionError, setPaymentSessionError] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [runningShareAction, setRunningShareAction] = useState<{
    shareId: string;
    action: CashierPaymentShareAction;
  } | null>(null);

  const [form, setForm] = useState({
    sessionId: "",
    splitMode: "BY_GUEST_ITEMS" as InvoiceSplitMode,
    payerGuestId: ""
  });

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === form.sessionId),
    [sessions, form.sessionId]
  );

  async function loadData(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
    }

    setError("");
    setReceiptError("");

    try {
      const [sessionData, receiptData] = await Promise.all([fetchSessions(), fetchReceipts()]);
      setSessions(sessionData);
      setReceipts(receiptData);

      if (!form.sessionId && sessionData[0]) {
        setForm((prev) => ({ ...prev, sessionId: sessionData[0].id }));
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load cashier data";
      setError(message);
      setReceiptError(message);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!invoice || !paymentSession) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/cashier/invoices/${encodeURIComponent(invoice.id)}/payment-session`, {
          method: "POST",
          cache: "no-store"
        });
        const json = (await response.json()) as PaymentSessionResponse;

        if (response.ok && json.data) {
          setPaymentSession(json.data.paymentSession);
          void loadData({ silent: true });
        }
      } catch {
        // Keep the currently visible payment state if a polling request fails.
      }
    }, 3000);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, paymentSession?.id]);

  useRealtimeEvents({
    role: "cashier",
    onEvent: (event) => {
      if (event.type === "kitchen.item-status.updated") {
        void loadData({ silent: true });
      }
    }
  });

  async function handleCalculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvoiceError("");
    setPaymentSession(null);
    setPaymentSessionNotice("");
    setPaymentSessionError("");
    setRunningShareAction(null);
    setIsCalculating(true);

    try {
      const response = await fetch("/api/cashier/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: form.sessionId,
          splitMode: form.splitMode,
          payerGuestId: form.splitMode === "FULL_BY_ONE" ? form.payerGuestId : undefined
        })
      });

      const json = (await response.json()) as InvoiceResponse;

      if (!response.ok) {
        throw new Error(json.error || "Invoice calculation failed");
      }

      setInvoice(json.data);
    } catch (calcError) {
      setInvoiceError(calcError instanceof Error ? calcError.message : "Invoice calculation failed");
    } finally {
      setIsCalculating(false);
    }
  }

  async function handlePreparePayment() {
    if (!invoice) {
      return;
    }

    setPaymentSessionError("");
    setPaymentSessionNotice("");
    setRunningShareAction(null);
    setIsPreparingPayment(true);

    try {
      const response = await fetch(`/api/cashier/invoices/${encodeURIComponent(invoice.id)}/payment-session`, {
        method: "POST"
      });

      const json = (await response.json()) as PaymentSessionResponse;

      if (!response.ok) {
        throw new Error(json.error || "Preparing payment shares failed.");
      }

      setPaymentSession(json.data.paymentSession);
      setPaymentSessionNotice(
        json.data.created
          ? "Payment shares are ready. You can start collection for each share and complete pending ones."
          : "An existing payment session for this check was loaded."
      );
    } catch (prepareError) {
      setPaymentSessionError(prepareError instanceof Error ? prepareError.message : "Preparing payment shares failed.");
    } finally {
      setIsPreparingPayment(false);
    }
  }

  async function handleShareAction(shareId: string, action: CashierPaymentShareAction) {
    setPaymentSessionError("");
    setPaymentSessionNotice("");
    setRunningShareAction({ shareId, action });

    try {
      const response = await fetch(`/api/cashier/payment-shares/${encodeURIComponent(shareId)}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });

      const json = (await response.json()) as PaymentShareActionResponse;

      if (!response.ok) {
        throw new Error(json.error || "Payment share update failed.");
      }

      setPaymentSession(json.data.paymentSession);
      setPaymentSessionNotice(json.data.message);
      void loadData({ silent: true });
    } catch (actionError) {
      setPaymentSessionError(actionError instanceof Error ? actionError.message : "Payment share update failed.");
    } finally {
      setRunningShareAction(null);
    }
  }

  function handleExportAllReceipts() {
    setExportError("");

    if (receipts.length === 0) {
      setExportError("No settled receipts are available to export.");
      return;
    }

    try {
      writeReceiptsExcel(receipts, `cashier-receipts-${formatFileDate()}.xlsx`);
    } catch (exportFailure) {
      setExportError(exportFailure instanceof Error ? exportFailure.message : "Receipt export failed.");
    }
  }

  function handleExportReceipt(receipt: CashierReceipt) {
    setExportError("");

    try {
      writeReceiptsExcel([receipt], receiptFileName(receipt, "xlsx"));
    } catch (exportFailure) {
      setExportError(exportFailure instanceof Error ? exportFailure.message : "Receipt export failed.");
    }
  }

  function handleDownloadPaperReceipt(receipt: CashierReceipt) {
    setExportError("");

    try {
      downloadPaperReceipt(receipt);
    } catch (downloadFailure) {
      setExportError(downloadFailure instanceof Error ? downloadFailure.message : "Paper receipt download failed.");
    }
  }

  function handlePrintPaperReceipt(receipt: CashierReceipt) {
    setExportError("");

    try {
      const printWindow = window.open("", "_blank", "width=420,height=720");

      if (!printWindow) {
        setExportError("The print window was blocked. Allow pop-ups for this site and try again.");
        return;
      }

      printWindow.document.open();
      printWindow.document.write(buildPaperReceiptHtml(receipt));
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => {
        printWindow.print();
      }, 250);
    } catch (printFailure) {
      setExportError(printFailure instanceof Error ? printFailure.message : "Paper receipt print failed.");
    }
  }

  function isShareActionRunning(shareId: string, action: CashierPaymentShareAction): boolean {
    return runningShareAction?.shareId === shareId && runningShareAction.action === action;
  }

  const totalGuests = sessions.reduce((sum, session) => sum + session.guests.length, 0);
  const invoiceSplitTotal = invoice ? invoice.splits.reduce((sum, split) => sum + Number(split.amount), 0) : 0;
  const invoiceUnassignedAmount = invoice ? Math.max(Number(invoice.total) - invoiceSplitTotal, 0) : 0;
  const invoiceAverageShare = invoice && invoice.splits.length > 0 ? Number(invoice.total) / invoice.splits.length : 0;
  const guestLineBreakdown = useMemo(() => {
    if (!invoice) {
      return new Map<string, { itemCount: number; lineCount: number; orderedTotal: number }>();
    }

    const grouped = new Map<string, { itemCount: number; lineCount: number; orderedTotal: number }>();

    for (const line of invoice.lines) {
      if (!line.guest) {
        continue;
      }

      const current = grouped.get(line.guest.id) ?? {
        itemCount: 0,
        lineCount: 0,
        orderedTotal: 0
      };

      current.itemCount += resolveInvoiceLineQuantity(line);
      current.lineCount += 1;
      current.orderedTotal += Number(line.amount);
      grouped.set(line.guest.id, current);
    }

    return grouped;
  }, [invoice]);
  const paymentSummary = useMemo(() => {
    if (!paymentSession) {
      return null;
    }

    return {
      totalAmount: Number(paymentSession.totalAmount),
      paidAmount: Number(paymentSession.paidAmount),
      remainingAmount: Number(paymentSession.remainingAmount),
      unpaidShareCount: paymentSession.shares.filter((share) => share.status !== "PAID").length,
      pendingShareCount: paymentSession.shares.filter((share) => share.status === "PENDING").length,
      failedShareCount: paymentSession.shares.filter((share) => share.status === "FAILED").length
    };
  }, [paymentSession]);
  const receiptSummary = useMemo(
    () => ({
      count: receipts.length,
      collectedAmount: receipts.reduce((sum, receipt) => sum + Number(receipt.collectedAmount), 0),
      tipAmount: receipts.reduce((sum, receipt) => sum + Number(receipt.tipAmount), 0),
      lastPaidAt: receipts[0]?.paidAt ?? null
    }),
    [receipts]
  );

  return (
    <div className="cashier-page stack-md">
      <section className="panel dashboard-hero cashier-hero stack-md">
        <div className="section-head cashier-hero-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Billing desk</p>
            <h2>Cashier settlement desk</h2>
            <p className="panel-subtitle">
              Calculate split invoices, prepare payment shares, and complete settlement per payer from one clear screen.
            </p>
          </div>
          <button
            type="button"
            className="cashier-refresh-btn"
            onClick={() => {
              loadData();
            }}
          >
            Refresh
          </button>
        </div>

        <div className="dashboard-stat-grid cashier-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Open sessions</p>
            <p className="dashboard-stat-value">{sessions.length}</p>
            <p className="dashboard-stat-note">Tables waiting for checkout.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Guests in house</p>
            <p className="dashboard-stat-value">{totalGuests}</p>
            <p className="dashboard-stat-note">Joined diners across active tables.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Selected table</p>
            <p className="dashboard-stat-value">{selectedSession ? selectedSession.table.name : "-"}</p>
            <p className="dashboard-stat-note">
              {selectedSession ? formatSessionSummary(selectedSession) : "Choose an active session to begin."}
            </p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Split mode</p>
            <p className="dashboard-stat-value">{splitModeLabel(form.splitMode)}</p>
            <p className="dashboard-stat-note">{splitModeDescription(form.splitMode)}</p>
          </article>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Loading open checks.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
        </div>
      </section>

      <form className="form-card stack-md cashier-check-form" onSubmit={handleCalculate}>
        <div className="section-copy">
          <h3>Calculate check</h3>
          <p className="helper-text">Prepare the check summary before creating payment shares.</p>
        </div>

        <label>
          Open session
          <select
            value={form.sessionId}
            onChange={(event) => setForm((prev) => ({ ...prev, sessionId: event.target.value }))}
            required
          >
            <option value="">Select session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {formatSessionLabel(session)}
              </option>
            ))}
          </select>
        </label>

        {selectedSession ? (
          <div className="selection-summary stack-md">
            <div className="badge-row">
              <span className="badge badge-outline">{selectedSession.branch.name}</span>
              <span className="badge badge-neutral">Table {selectedSession.table.name}</span>
              <span className="badge badge-status-open">{selectedSession.guests.length} guests joined</span>
              {selectedSession.readyToCloseAt ? (
                <span className="badge badge-status-paid-payment">Ready to close</span>
              ) : null}
            </div>
            <p className="helper-text">
              {formatSessionSummary(selectedSession)}
              {selectedSession.readyToCloseAt ? ` | Ready at: ${formatDateTime(selectedSession.readyToCloseAt)}` : ""}
            </p>
          </div>
        ) : null}

        <label>
          Split mode
          <select
            value={form.splitMode}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                splitMode: event.target.value as InvoiceSplitMode,
                payerGuestId: ""
              }))
            }
          >
            <option value="BY_GUEST_ITEMS">By guest items</option>
            <option value="EQUAL">Equal split</option>
            <option value="FULL_BY_ONE">Full bill (one guest)</option>
          </select>
        </label>

        <div className="helper-panel stack-md">
          <p className="helper-text">{splitModeDescription(form.splitMode)}</p>
          <p className="meta">{splitModeHelper(form.splitMode)}</p>
        </div>

        {form.splitMode === "FULL_BY_ONE" ? (
          <label>
            Paying guest
            <select
              value={form.payerGuestId}
              onChange={(event) => setForm((prev) => ({ ...prev, payerGuestId: event.target.value }))}
              required
            >
              <option value="">Select guest</option>
              {selectedSession?.guests.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button type="submit" disabled={isCalculating || !form.sessionId}>
          {isCalculating ? "Calculating..." : "Calculate check"}
        </button>
        {invoiceError ? <p className="status-banner is-error">{invoiceError}</p> : null}
      </form>

      {invoice ? (
        <section className="panel stack-md invoice-result-panel">
          {isCalculating ? <p className="status-banner is-neutral">Refreshing check summary.</p> : null}

          <div className="section-head">
            <div className="section-copy">
              <p className="section-kicker">Check</p>
              <h3>{formatInvoiceNumber(invoice.id, invoice.createdAt)}</h3>
              <p className="panel-subtitle">The check summary stays visible during payment preparation.</p>
            </div>
            <span className="badge badge-outline">{splitModeLabel(invoice.splitMode)}</span>
          </div>

          <div className="invoice-total-card">
            <p className="dashboard-stat-label">Total check</p>
            <p className="invoice-total-value">{formatTryCurrency(invoice.total)}</p>
            <p className="dashboard-stat-note">
              {invoice.splits.length} payment share(s), {invoice.lines.length} line item(s).
            </p>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Split mode</span>
              <span className="detail-value">{splitModeLabel(invoice.splitMode)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Average per person</span>
              <span className="detail-value">{formatTryCurrency(invoiceAverageShare)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Assigned amount</span>
              <span className="detail-value">{formatTryCurrency(invoiceSplitTotal)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Unassigned amount</span>
              <span className="detail-value">{formatTryCurrency(invoiceUnassignedAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Calculated at</span>
              <span className="detail-value">{formatDateTime(invoice.createdAt)}</span>
            </div>
          </div>

          <div className="prepare-payment-panel stack-md">
            <div className="section-copy">
              <h4>Prepare payments</h4>
              <p className="helper-text">
                Create payment shares after the check is calculated. Cash, card, and online-link actions can all be
                managed from this screen for TRY payments.
              </p>
            </div>

            <div className="ticket-actions">
              <button
                type="button"
                className="ticket-action-btn"
                onClick={handlePreparePayment}
                disabled={isPreparingPayment}
              >
                {isPreparingPayment ? "Preparing..." : "Create payment shares"}
              </button>
            </div>
          </div>

          {paymentSessionNotice ? <p className="status-banner is-success">{paymentSessionNotice}</p> : null}
          {paymentSessionError ? <p className="status-banner is-error">{paymentSessionError}</p> : null}

          {paymentSession ? (
            <div className="settlement-desk stack-md">
              <div className="section-head">
                <div className="section-copy">
                  <p className="section-kicker">Payment tracking</p>
                  <h4>Payment shares</h4>
                  <p className="helper-text">Start collection for each share, complete pending ones, and monitor the remaining amount.</p>
                </div>
                <span className={`badge ${paymentSessionStatusBadgeClass(paymentSession.status)}`}>
                  {formatStatusLabel(paymentSession.status)}
                </span>
              </div>

              {paymentSession.session?.readyToCloseAt ? (
                <p className="status-banner is-success">
                  Table {paymentSession.session.table?.name ?? selectedSession?.table.name ?? ""} is ready to close. Time:{" "}
                  {formatDateTime(paymentSession.session.readyToCloseAt)}.
                </p>
              ) : null}

              {paymentSummary ? (
                <div className="grid-4 checkout-summary-grid">
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Total amount</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.totalAmount)}</p>
                    <p className="dashboard-stat-note">Total TRY amount to collect.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Paid amount</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.paidAmount)}</p>
                    <p className="dashboard-stat-note">Collected payment shares.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Remaining amount</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.remainingAmount)}</p>
                    <p className="dashboard-stat-note">TRY balance still waiting for collection.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Open shares</p>
                    <p className="dashboard-stat-value">{paymentSummary.unpaidShareCount}</p>
                    <p className="dashboard-stat-note">
                      Pending {paymentSummary.pendingShareCount} | Failed {paymentSummary.failedShareCount}
                    </p>
                  </article>
                </div>
              ) : null}

              <div className="section-copy">
                <h4>Generated payment shares</h4>
                <p className="helper-text">Each card shows payer, amount, payment status, and cashier actions.</p>
              </div>

              <div className="checkout-share-grid">
                {paymentSession.shares.map((share) => {
                  const isPaid = share.status === "PAID";
                  const isPending = share.status === "PENDING";
                  const canStartPayment = share.status === "UNPAID" || share.status === "FAILED";
                  const canMarkFailedDirectly = share.status === "UNPAID";
                  const actionLocked = Boolean(runningShareAction) || isPreparingPayment;

                  return (
                    <article key={share.id} className="checkout-share-card stack-md">
                      <div className="checkout-share-head">
                        <div className="checkout-share-copy">
                          <p className="checkout-share-payer">{share.payerLabel}</p>
                          <p className="meta">{share.guest ? `Guest: ${share.guest.displayName}` : "Table-level payer"}</p>
                        </div>
                        <p className="checkout-share-amount">{formatTryCurrency(share.amount)}</p>
                      </div>

                      <div className="badge-row">
                        <span className={`badge ${paymentShareStatusBadgeClass(share.status)}`}>
                          {formatStatusLabel(share.status)}
                        </span>
                        {share.provider ? <span className="badge badge-outline">{paymentProviderLabel(share.provider)}</span> : null}
                        {Number(share.tip) > 0 ? <span className="badge badge-neutral">Tip {formatTryCurrency(share.tip)}</span> : null}
                        {share.paidAt ? <span className="badge badge-neutral">Paid {formatShortTime(share.paidAt)}</span> : null}
                      </div>

                      {share.paymentUrl ? (
                        <p className="helper-text">
                          Online payment link is ready:{" "}
                          <a className="checkout-link" href={share.paymentUrl} target="_blank" rel="noreferrer">
                            Open payment page
                          </a>
                        </p>
                      ) : null}

                      {share.paidAt ? <p className="meta">Completed at: {formatDateTime(share.paidAt)}</p> : null}

                      {canStartPayment ? (
                        <div className="ticket-actions">
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "PAY_BY_CASH")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "PAY_BY_CASH") ? "Starting cash..." : "Collect cash"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "PAY_BY_CARD")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "PAY_BY_CARD") ? "Starting card..." : "Collect card"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "SEND_ONLINE_LINK")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "SEND_ONLINE_LINK")
                              ? "Sending link..."
                              : "Send payment link"}
                          </button>
                        </div>
                      ) : null}

                      {isPending ? (
                        <div className="ticket-actions">
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "COMPLETE_PENDING_PAYMENT")}
                            disabled={actionLocked}
                          >
                            {isShareActionRunning(share.id, "COMPLETE_PENDING_PAYMENT")
                              ? "Completing..."
                              : "Complete payment"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn warn"
                            onClick={() => handleShareAction(share.id, "MARK_PAYMENT_FAILED")}
                            disabled={actionLocked}
                          >
                            {isShareActionRunning(share.id, "MARK_PAYMENT_FAILED") ? "Updating..." : "Mark as failed"}
                          </button>
                        </div>
                      ) : null}

                      {canMarkFailedDirectly ? (
                        <div className="ticket-actions">
                          <button
                            type="button"
                            className="ticket-action-btn warn"
                            onClick={() => handleShareAction(share.id, "MARK_PAYMENT_FAILED")}
                            disabled={actionLocked}
                          >
                            {isShareActionRunning(share.id, "MARK_PAYMENT_FAILED")
                              ? "Updating..."
                              : "Mark mock failure"}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid-2">
            <div>
              <div className="section-copy">
                <h4>Guest payment shares</h4>
                <p className="helper-text">Review share distribution before collecting payments.</p>
              </div>
              <div className="split-grid">
                {invoice.splits.map((split) => {
                  const sharePercent = Number(invoice.total) > 0 ? (Number(split.amount) / Number(invoice.total)) * 100 : 0;
                  const guestBreakdown = split.guest ? guestLineBreakdown.get(split.guest.id) ?? null : null;
                  const shareDiffersFromOwnItems = guestBreakdown
                    ? Math.abs(Number(split.amount) - guestBreakdown.orderedTotal) > 0.009
                    : false;

                  return (
                    <article key={split.id} className="split-card stack-md">
                      <div className="badge-row">
                        <span className="badge badge-outline">{split.payerLabel}</span>
                        {split.guest ? <span className="badge badge-neutral">{split.guest.displayName}</span> : null}
                      </div>
                      <p>
                        <strong>{formatTryCurrency(split.amount)}</strong>
                      </p>
                      <p className="meta">{formatPercentage(sharePercent)} of total check</p>
                      {guestBreakdown ? (
                        <p className="meta">
                          Ordered items: {guestBreakdown.itemCount} item(s), {formatTryCurrency(guestBreakdown.orderedTotal)}
                        </p>
                      ) : null}
                      {shareDiffersFromOwnItems ? (
                        <p className="meta">Share amount differs from ordered-item subtotal because split mode is not by guest items.</p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="section-copy">
                <h4>Check line items</h4>
                <p className="helper-text">Items that make up the total check.</p>
              </div>
              <div className="list">
                {invoice.lines.map((line) => (
                  <div key={line.id} className="list-item entity-card stack-md">
                    <div className="entity-top">
                      <p>
                        <strong>{line.itemName ?? line.label}</strong>
                      </p>
                      <span className="badge badge-outline">{formatTryCurrency(line.amount)}</span>
                    </div>
                    {line.unitPrice ? (
                      <p className="meta">
                        Qty {resolveInvoiceLineQuantity(line)} x {formatTryCurrency(line.unitPrice)}
                      </p>
                    ) : null}
                    <p className="meta">{line.guest ? `Assigned: ${line.guest.displayName}` : "Shared line item"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel">
          <p className="empty empty-state">No check has been calculated yet. Start by selecting an open session and split mode.</p>
        </section>
      )}

      <section className="panel stack-md receipt-archive-panel">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">Receipt archive</p>
            <h3>Settled receipts</h3>
            <p className="panel-subtitle">Paid checks stay available here after the table closes.</p>
          </div>
          <div className="ticket-actions receipt-archive-actions">
            <button type="button" className="ticket-action-btn" onClick={handleExportAllReceipts} disabled={receipts.length === 0}>
              Export all Excel
            </button>
            <button type="button" className="ticket-action-btn" onClick={() => loadData()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="dashboard-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Receipts</p>
            <p className="dashboard-stat-value">{receiptSummary.count}</p>
            <p className="dashboard-stat-note">Fully settled checks.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Collected</p>
            <p className="dashboard-stat-value">{formatTryCurrency(receiptSummary.collectedAmount)}</p>
            <p className="dashboard-stat-note">Payments plus tips.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Tips</p>
            <p className="dashboard-stat-value">{formatTryCurrency(receiptSummary.tipAmount)}</p>
            <p className="dashboard-stat-note">Tip total in archive.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Last paid</p>
            <p className="dashboard-stat-value">{receiptSummary.lastPaidAt ? formatShortTime(receiptSummary.lastPaidAt) : "-"}</p>
            <p className="dashboard-stat-note">
              {receiptSummary.lastPaidAt ? formatDateTime(receiptSummary.lastPaidAt) : "No receipt yet."}
            </p>
          </article>
        </div>

        <div className="status-stack">
          {receiptError ? <p className="status-banner is-error">{receiptError}</p> : null}
          {exportError ? <p className="status-banner is-error">{exportError}</p> : null}
        </div>

        {receipts.length === 0 ? (
          <p className="empty empty-state">No settled receipts yet. Completed payments will appear here after checkout.</p>
        ) : (
          <div className="receipt-list">
            {receipts.map((receipt) => {
              const receiptNumber = formatInvoiceNumber(receipt.invoiceId, receipt.createdAt);
              const isExpanded = expandedReceiptId === receipt.id;
              const paidShareCount = receipt.shares.filter((share) => share.status === "PAID").length;

              return (
                <article key={receipt.id} className="list-item entity-card receipt-card stack-md">
                  <div className="entity-top">
                    <div className="entity-title">
                      <h4>{receiptNumber}</h4>
                      <p className="entity-summary">
                        {receipt.branch?.name ?? "Branch"} | Table {receipt.table?.name ?? "-"} | {formatDateTime(receipt.paidAt)}
                      </p>
                    </div>
                    <span className="badge badge-outline">{formatTryCurrency(receipt.collectedAmount)}</span>
                  </div>

                  <div className="badge-row">
                    <span className={`badge ${paymentSessionStatusBadgeClass(receipt.status)}`}>{formatStatusLabel(receipt.status)}</span>
                    <span className="badge badge-neutral">{splitModeLabel(receipt.splitMode)}</span>
                    <span className="badge badge-neutral">
                      {paidShareCount}/{receipt.shares.length} paid shares
                    </span>
                    {receipt.table?.code ? <span className="badge badge-outline">{receipt.table.code}</span> : null}
                  </div>

                  <div className="detail-grid">
                    <div className="detail-card">
                      <span className="detail-label">Subtotal</span>
                      <span className="detail-value">{formatTryCurrency(receipt.total)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">Tips</span>
                      <span className="detail-value">{formatTryCurrency(receipt.tipAmount)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">Collected</span>
                      <span className="detail-value">{formatTryCurrency(receipt.collectedAmount)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">Guests</span>
                      <span className="detail-value">{receipt.guests.length}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">Items</span>
                      <span className="detail-value">{receipt.lines.length}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">Payments</span>
                      <span className="detail-value">{receipt.payments.length}</span>
                    </div>
                  </div>

                  <div className="ticket-actions">
                    <button type="button" className="ticket-action-btn" onClick={() => handleDownloadPaperReceipt(receipt)}>
                      Download receipt
                    </button>
                    <button type="button" className="ticket-action-btn" onClick={() => handlePrintPaperReceipt(receipt)}>
                      Print receipt
                    </button>
                    <button type="button" className="ticket-action-btn" onClick={() => handleExportReceipt(receipt)}>
                      Export Excel
                    </button>
                    <button
                      type="button"
                      className="ticket-action-btn"
                      onClick={() => setExpandedReceiptId(isExpanded ? null : receipt.id)}
                    >
                      {isExpanded ? "Hide receipt" : "View receipt"}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="receipt-details">
                      <div className="receipt-detail-column">
                        <h4>Items</h4>
                        <div className="receipt-row-list">
                          {receipt.lines.map((line) => (
                            <div key={line.id} className="receipt-row">
                              <div>
                                <strong>{line.itemName ?? line.label}</strong>
                                <p className="meta">
                                  {line.guestName ? `${line.guestName} | ` : ""}
                                  Qty {line.quantity ?? 1}
                                  {line.unitPrice ? ` x ${formatTryCurrency(line.unitPrice)}` : ""}
                                </p>
                              </div>
                              <strong>{formatTryCurrency(line.amount)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="receipt-detail-column">
                        <h4>Payments</h4>
                        <div className="receipt-row-list">
                          {receipt.shares.map((share) => (
                            <div key={share.id} className="receipt-row">
                              <div>
                                <strong>{share.payerLabel}</strong>
                                <p className="meta">
                                  {share.provider ? paymentProviderLabel(share.provider) : "Payment"} |{" "}
                                  {formatStatusLabel(share.status)}
                                  {share.providerPaymentId ? ` | ${share.providerPaymentId}` : ""}
                                </p>
                                {Number(share.tip) > 0 ? <p className="meta">Tip {formatTryCurrency(share.tip)}</p> : null}
                                {share.paidAt ? <p className="meta">{formatDateTime(share.paidAt)}</p> : null}
                              </div>
                              <strong>{formatTryCurrency(share.totalCharged)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

