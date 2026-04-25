"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";
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
  providerPaymentId: string | null;
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

const ALL_TABLES_KEY = "__all_tables__";

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

function isFullyCollectedPaymentSession(paymentSession: PaymentSession | null): boolean {
  if (!paymentSession) {
    return false;
  }

  if (paymentSession.status === "PAID") {
    return true;
  }

  if (paymentSession.shares.length === 0 || !paymentSession.shares.every((share) => share.status === "PAID")) {
    return false;
  }

  const paidBaseAmount = paymentSession.shares.reduce((sum, share) => sum + Number(share.amount), 0);
  return paidBaseAmount + 0.009 >= Number(paymentSession.totalAmount);
}

function buildCurrentReceipt(
  invoice: InvoiceResponse["data"] | null,
  paymentSession: PaymentSession | null,
  selectedSession: OpenSession | undefined
): CashierReceipt | null {
  if (!invoice || !paymentSession || !isFullyCollectedPaymentSession(paymentSession)) {
    return null;
  }

  const paidAt =
    paymentSession.session?.closedAt ??
    paymentSession.session?.readyToCloseAt ??
    paymentSession.shares
      .map((share) => share.paidAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
    new Date().toISOString();
  const guestsById = new Map<string, Guest>();

  for (const guest of selectedSession?.guests ?? []) {
    guestsById.set(guest.id, guest);
  }

  for (const split of invoice.splits) {
    if (split.guest) {
      guestsById.set(split.guest.id, split.guest);
    }
  }

  const paidShares = paymentSession.shares.filter((share) => share.status === "PAID");
  const tipAmount = paidShares.reduce((sum, share) => sum + Number(share.tip), 0);
  const collectedAmount = paidShares.reduce((sum, share) => sum + Number(share.amount) + Number(share.tip), 0);

  return {
    id: paymentSession.id,
    invoiceId: invoice.id,
    sessionId: paymentSession.session?.id ?? selectedSession?.id ?? "",
    splitMode: invoice.splitMode,
    status: "PAID",
    currency: paymentSession.currency,
    total: invoice.total,
    paidAmount: paymentSession.paidAmount,
    remainingAmount: paymentSession.remainingAmount,
    tipAmount: tipAmount.toFixed(2),
    collectedAmount: collectedAmount.toFixed(2),
    createdAt: invoice.createdAt,
    paidAt,
    branch: selectedSession ? { id: selectedSession.branch.id, name: selectedSession.branch.name } : null,
    table: paymentSession.session?.table
      ? {
          id: paymentSession.session.table.id,
          name: paymentSession.session.table.name,
          code: paymentSession.session.table.code
        }
      : null,
    guests: Array.from(guestsById.values()),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      label: line.label,
      amount: line.amount,
      itemName: line.itemName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      guestId: line.guest?.id ?? null,
      guestName: line.guest?.displayName ?? null
    })),
    shares: paymentSession.shares.map((share) => ({
      id: share.id,
      payerLabel: share.payerLabel,
      guestId: share.guest?.id ?? null,
      guestName: share.guest?.displayName ?? null,
      amount: share.amount,
      tip: share.tip,
      totalCharged: (Number(share.amount) + Number(share.tip)).toFixed(2),
      status: share.status,
      provider: share.provider,
      providerPaymentId: share.providerPaymentId,
      paidAt: share.paidAt
    })),
    payments: paidShares.map((share) => ({
      id: `receipt_payment_${share.id}`,
      guestId: share.guest?.id ?? null,
      guestName: share.guest?.displayName ?? null,
      amount: (Number(share.amount) + Number(share.tip)).toFixed(2),
      currency: paymentSession.currency,
      method: share.provider ?? "PAYMENT",
      status: "COMPLETED",
      reference: share.providerPaymentId,
      paidAt: share.paidAt ?? paidAt,
      createdAt: share.paidAt ?? paidAt
    }))
  };
}

export default function CashierDashboardPage() {
  const { locale, t } = useDashboardLanguage();
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
  const [receiptTableFilter, setReceiptTableFilter] = useState<string>(ALL_TABLES_KEY);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === form.sessionId),
    [sessions, form.sessionId]
  );
  const currentPaymentReceipt = useMemo(
    () => buildCurrentReceipt(invoice, paymentSession, selectedSession),
    [invoice, paymentSession, selectedSession]
  );
  const receiptArchiveReceipts = useMemo(() => {
    if (!currentPaymentReceipt) {
      return receipts;
    }

    const alreadyArchived = receipts.some((receipt) => receipt.invoiceId === currentPaymentReceipt.invoiceId);
    return alreadyArchived ? receipts : [currentPaymentReceipt, ...receipts];
  }, [currentPaymentReceipt, receipts]);
  const activeInvoiceId = paymentSession?.invoiceId ?? invoice?.id ?? null;
  const isPaymentSessionSettled = isFullyCollectedPaymentSession(paymentSession);
  const settledReceipt = useMemo(() => {
    if (!activeInvoiceId) {
      return null;
    }

    return receiptArchiveReceipts.find((receipt) => receipt.invoiceId === activeInvoiceId) ?? null;
  }, [activeInvoiceId, receiptArchiveReceipts]);

  const receiptTableGroups = useMemo(() => {
    const grouped = new Map<string, { tableName: string; branchName: string; count: number }>();

    for (const receipt of receiptArchiveReceipts) {
      if (!receipt.table) {
        continue;
      }

      const branchName = receipt.branch?.name ?? "";
      const tableName = receipt.table.name;
      const key = `${branchName}::${tableName}`;
      const current = grouped.get(key) ?? { tableName, branchName, count: 0 };

      current.count += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.entries()).map(([key, value]) => ({ key, ...value }));
  }, [receiptArchiveReceipts]);

  const filteredReceipts = useMemo(() => {
    if (receiptTableFilter === ALL_TABLES_KEY) {
      return receiptArchiveReceipts;
    }

    return receiptArchiveReceipts.filter((receipt) => {
      if (!receipt.table) {
        return false;
      }

      const key = `${receipt.branch?.name ?? ""}::${receipt.table.name}`;
      return key === receiptTableFilter;
    });
  }, [receiptTableFilter, receiptArchiveReceipts]);

  useEffect(() => {
    if (receiptTableFilter === ALL_TABLES_KEY) {
      return;
    }

    const stillExists = receiptTableGroups.some((group) => group.key === receiptTableFilter);
    if (!stillExists) {
      setReceiptTableFilter(ALL_TABLES_KEY);
    }
  }, [receiptTableFilter, receiptTableGroups]);

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

      setForm((prev) => {
        const selectedSessionStillOpen = sessionData.some((session) => session.id === prev.sessionId);

        if (selectedSessionStillOpen) {
          return prev;
        }

        return { ...prev, sessionId: sessionData[0]?.id ?? "", payerGuestId: "" };
      });
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

    if (paymentSession.status === "PAID") {
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
  }, [invoice?.id, paymentSession?.id, paymentSession?.status]);

  useEffect(() => {
    if (!isPaymentSessionSettled) {
      return;
    }

    void loadData({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaymentSessionSettled, paymentSession?.id]);

  useEffect(() => {
    if (!isPaymentSessionSettled || !settledReceipt) {
      return;
    }

    if (settledReceipt.table) {
      setReceiptTableFilter(`${settledReceipt.branch?.name ?? ""}::${settledReceipt.table.name}`);
    }

    setExpandedReceiptId(settledReceipt.id);
  }, [isPaymentSessionSettled, settledReceipt]);

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
      if (!selectedSession) {
        throw new Error("Select an open session before calculating.");
      }

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

    if (paymentSession?.status === "PAID") {
      setPaymentSessionNotice("This check is already paid. Use the settled receipt for export.");
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
    if (paymentSession?.status === "PAID") {
      setPaymentSessionNotice("This check is already paid. Use the settled receipt for export.");
      return;
    }

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

    if (receiptArchiveReceipts.length === 0) {
      setExportError("No settled receipts are available to export.");
      return;
    }

    try {
      writeReceiptsExcel(receiptArchiveReceipts, `cashier-receipts-${formatFileDate()}.xlsx`);
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
      count: receiptArchiveReceipts.length,
      collectedAmount: receiptArchiveReceipts.reduce((sum, receipt) => sum + Number(receipt.collectedAmount), 0),
      tipAmount: receiptArchiveReceipts.reduce((sum, receipt) => sum + Number(receipt.tipAmount), 0),
      lastPaidAt: receiptArchiveReceipts[0]?.paidAt ?? null
    }),
    [receiptArchiveReceipts]
  );
  const paymentCompletionRate =
    paymentSummary && paymentSummary.totalAmount > 0
      ? (paymentSummary.paidAmount / paymentSummary.totalAmount) * 100
      : 0;
  const localizedSplitModeLabel = (mode: InvoiceSplitMode) =>
    locale === "tr"
      ? mode === "FULL_BY_ONE"
        ? "Tek kisi tum hesap"
        : mode === "BY_GUEST_ITEMS"
          ? "Misafir urunlerine gore"
          : "Esit bolme"
      : splitModeLabel(mode);
  const localizedSplitModeDescription = (mode: InvoiceSplitMode) =>
    locale === "tr"
      ? mode === "FULL_BY_ONE"
        ? "Tum hesap tek bir misafire atanir."
        : mode === "BY_GUEST_ITEMS"
          ? "Her misafir sadece kendi siparis ettigi urunleri oder."
          : "Toplam hesap masadaki misafirler arasinda esit bolunur."
      : splitModeDescription(mode);
  const localizedSplitModeHelper = (mode: InvoiceSplitMode) =>
    locale === "tr"
      ? mode === "FULL_BY_ONE"
        ? "Tek bir kisi kart veya nakitle tum hesabi odediginde en uygunudur."
        : mode === "BY_GUEST_ITEMS"
          ? "Her misafirin kendi urunlerini odedigi akislarda en uygunudur."
          : "Gruplar esit paylasim istediginde hizli cikis icin en uygunudur."
      : splitModeHelper(mode);
  const localizedStatusLabel = (value: string) => {
    if (locale !== "tr") return formatStatusLabel(value);
    if (value === "OPEN") return "Acik";
    if (value === "PARTIALLY_PAID") return "Kismen odendi";
    if (value === "PAID") return "Odendi";
    if (value === "FAILED") return "Basarisiz";
    if (value === "EXPIRED") return "Suresi doldu";
    if (value === "UNPAID") return "Odenmedi";
    if (value === "PENDING") return "Beklemede";
    if (value === "CANCELLED") return "Iptal edildi";
    return value;
  };
  const localizedProviderLabel = (provider: string) => {
    if (locale !== "tr") return paymentProviderLabel(provider);
    if (provider === "CASH_DESK") return "Kasa";
    if (provider === "CARD_POS") return "Kart POS";
    if (provider === "MOCK_ONLINE_LINK") return "Online odeme linki";
    return localizedStatusLabel(provider);
  };

  return (
    <div className="cashier-page stack-md">
      <section className="panel dashboard-hero cashier-hero stack-md">
        <div className="section-head cashier-hero-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">{t("Billing desk", "Tahsilat masasi")}</p>
            <h2>{t("Cashier settlement desk", "Kasiyer tahsilat masasi")}</h2>
            <p className="panel-subtitle">
              {t(
                "Calculate split invoices, prepare payment shares, and complete settlement per payer from one clear screen.",
                "Bolunmus faturalari hesaplayin, odeme paylarini hazirlayin ve her odeyen icin tahsilati tek ekrandan tamamlayin."
              )}
            </p>
          </div>
          <button
            type="button"
            className="cashier-refresh-btn"
            onClick={() => {
              loadData();
            }}
          >
            {t("Refresh", "Yenile")}
          </button>
        </div>

        <div className="dashboard-stat-grid cashier-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Open sessions", "Acik oturumlar")}</p>
            <p className="dashboard-stat-value">{sessions.length}</p>
            <p className="dashboard-stat-note">{t("Tables waiting for checkout.", "Odeme icin bekleyen masalar.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Guests in house", "Icerideki misafirler")}</p>
            <p className="dashboard-stat-value">{totalGuests}</p>
            <p className="dashboard-stat-note">{t("Joined diners across active tables.", "Aktif masalardaki katilan misafirler.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Selected table", "Secili masa")}</p>
            <p className="dashboard-stat-value">{selectedSession ? selectedSession.table.name : "-"}</p>
            <p className="dashboard-stat-note">
              {selectedSession ? formatSessionSummary(selectedSession) : t("Choose an active session to begin.", "Baslamak icin aktif bir oturum secin.")}
            </p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Split mode", "Bolme modu")}</p>
            <p className="dashboard-stat-value">{localizedSplitModeLabel(form.splitMode)}</p>
            <p className="dashboard-stat-note">{localizedSplitModeDescription(form.splitMode)}</p>
          </article>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">{t("Loading open checks.", "Acik hesaplar yukleniyor.")}</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
        </div>
      </section>

      <section className="panel dashboard-briefing-panel cashier-briefing-panel">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">{t("Checkout script", "Odeme akisi")}</p>
            <h3>{t("Turn settlement into the strongest part of the client demo", "Tahsilati musteri demosunun en guclu bolumune donusturun")}</h3>
            <p className="panel-subtitle">
              {t(
                "Use this screen as the commercial payoff: choose the live table, calculate the split, then collect each share while the receipt archive updates in real time.",
                "Bu ekrani ticari kapanis olarak kullanin: canli masayi secin, bolmeyi hesaplayin, sonra fis arsivi gercek zamanli guncellenirken her payi tahsil edin."
              )}
            </p>
          </div>
        </div>

        <div className="dashboard-story-grid dashboard-story-grid--three">
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">01</span>
            <h4>{t("Pick the open table", "Acik masayi secin")}</h4>
            <p>
              {selectedSession
                ? t(
                    `${selectedSession.branch.name} / Table ${selectedSession.table.name} has ${selectedSession.guests.length} guest(s) ready for settlement.`,
                    `${selectedSession.branch.name} / Masa ${selectedSession.table.name} icin ${selectedSession.guests.length} misafir tahsilata hazir.`
                  )
                : t("Select one of the live sessions to start the checkout story.", "Odeme hikayesini baslatmak icin canli oturumlardan birini secin.")}
            </p>
            <span className="dashboard-story-meta">{t("This links the cashier view directly to the live floor session.", "Bu, kasiyer ekranini dogrudan canli salon oturumuna baglar.")}</span>
          </article>
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">02</span>
            <h4>{t("Explain the split clearly", "Bolmeyi net bicimde aciklayin")}</h4>
            <p>
              {invoice
                ? t(
                    `${localizedSplitModeLabel(invoice.splitMode)} is calculated at ${formatTryCurrency(invoice.total)} across ${invoice.splits.length} payment share(s).`,
                    `${localizedSplitModeLabel(invoice.splitMode)} modu ${formatTryCurrency(invoice.total)} toplam ve ${invoice.splits.length} odeme payi ile hesaplandi.`
                  )
                : t(`${localizedSplitModeLabel(form.splitMode)} is selected and ready to calculate on demand.`, `${localizedSplitModeLabel(form.splitMode)} secili ve istenince hesaplanmaya hazir.`)}
            </p>
            <span className="dashboard-story-meta">{t("The customer sees both operational speed and billing flexibility.", "Musteri hem operasyon hizini hem de fatura esnekligini gorur.")}</span>
          </article>
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">03</span>
            <h4>{t("Collect and close", "Tahsil et ve kapat")}</h4>
            <p>
              {paymentSummary
                ? t(
                    `${percentageFormatter.format(paymentCompletionRate)}% of the total is already collected, with ${paymentSummary.unpaidShareCount} share(s) still open.`,
                    `Toplamin %${percentageFormatter.format(paymentCompletionRate)} kismi zaten tahsil edildi ve ${paymentSummary.unpaidShareCount} pay hala acik.`
                  )
                : t("Create payment shares to start cash, card, or online-link collection from this same screen.", "Nakit, kart veya online link tahsilatini bu ekrandan baslatmak icin odeme paylari olusturun.")}
            </p>
            <span className="dashboard-story-meta">{t("The receipt archive becomes the proof that payment completed.", "Fis arsivi, odemenin tamamlandiginin kaniti haline gelir.")}</span>
          </article>
        </div>

        <div className="dashboard-pulse-strip">
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Selected table", "Secili masa")}</span>
            <strong className="dashboard-pulse-value">{selectedSession ? t(`Table ${selectedSession.table.name}`, `Masa ${selectedSession.table.name}`) : t("Choose session", "Oturum secin")}</strong>
            <span className="dashboard-pulse-meta">
              {selectedSession ? formatSessionSummary(selectedSession) : t("Use the quick table chips to begin.", "Baslamak icin hizli masa secimlerini kullanin.")}
            </span>
          </article>
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Invoice total", "Fatura toplami")}</span>
            <strong className="dashboard-pulse-value">{invoice ? formatTryCurrency(invoice.total) : "-"}</strong>
            <span className="dashboard-pulse-meta">
              {invoice ? t(`${invoice.lines.length} line(s) and ${invoice.splits.length} share(s)`, `${invoice.lines.length} satir ve ${invoice.splits.length} odeme payi`) : t("Calculated totals appear here after the first step.", "Hesaplanan toplamlar ilk adimdan sonra burada gorunur.")}
            </span>
          </article>
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Collection progress", "Tahsilat ilerlemesi")}</span>
            <strong className="dashboard-pulse-value">
              {paymentSummary ? formatTryCurrency(paymentSummary.paidAmount) : formatTryCurrency(receiptSummary.collectedAmount)}
            </strong>
            <span className="dashboard-pulse-meta">
              {paymentSummary
                ? t(
                    `${paymentSummary.unpaidShareCount} unpaid, ${paymentSummary.pendingShareCount} pending, ${paymentSummary.failedShareCount} failed`,
                    `${paymentSummary.unpaidShareCount} odenmemis, ${paymentSummary.pendingShareCount} beklemede, ${paymentSummary.failedShareCount} basarisiz`
                  )
                : t(`${receiptSummary.count} settled receipt(s) already archived.`, `${receiptSummary.count} tamamlanmis fis zaten arsivde.`)}
            </span>
          </article>
        </div>
      </section>

      <form className="form-card stack-md cashier-check-form" onSubmit={handleCalculate}>
        <div className="section-copy">
          <h3>Calculate check</h3>
          <p className="helper-text">Prepare the check summary before creating payment shares.</p>
        </div>

        {sessions.length > 0 ? (
          <div className="table-filter-bar" role="tablist" aria-label="Quick pick table">
            {sessions.map((session) => {
              const isActive = form.sessionId === session.id;

              return (
                <button
                  key={session.id}
                  type="button"
                  className={`table-filter-chip${isActive ? " is-active" : ""}`}
                  onClick={() => setForm((prev) => ({ ...prev, sessionId: session.id, payerGuestId: "" }))}
                  aria-pressed={isActive}
                  title={formatSessionLabel(session)}
                >
                  <span>Table {session.table.name}</span>
                  <span className="table-filter-chip-count">{session.guests.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <label>
          Open session
          <select
            value={form.sessionId}
            onChange={(event) => setForm((prev) => ({ ...prev, sessionId: event.target.value }))}
            required
          >
            <option value="">{t("Select session", "Oturum secin")}</option>
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
              <span className="badge badge-neutral">{t(`Table ${selectedSession.table.name}`, `Masa ${selectedSession.table.name}`)}</span>
              <span className="badge badge-status-open">{t(`${selectedSession.guests.length} guests joined`, `${selectedSession.guests.length} misafir katildi`)}</span>
              {selectedSession.readyToCloseAt ? (
                <span className="badge badge-status-paid-payment">{t("Ready to close", "Kapatmaya hazir")}</span>
              ) : null}
            </div>
            <p className="helper-text">
              {formatSessionSummary(selectedSession)}
              {selectedSession.readyToCloseAt ? t(` | Ready at: ${formatDateTime(selectedSession.readyToCloseAt)}`, ` | Hazir olma: ${formatDateTime(selectedSession.readyToCloseAt)}`) : ""}
            </p>
          </div>
        ) : null}

        <label>
          {t("Split mode", "Bolme modu")}
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
            <option value="BY_GUEST_ITEMS">{locale === "tr" ? "Misafir urunlerine gore" : "By guest items"}</option>
            <option value="EQUAL">{locale === "tr" ? "Esit bolme" : "Equal split"}</option>
            <option value="FULL_BY_ONE">{locale === "tr" ? "Tum hesap (tek misafir)" : "Full bill (one guest)"}</option>
          </select>
        </label>

        <div className="helper-panel stack-md">
          <p className="helper-text">{localizedSplitModeDescription(form.splitMode)}</p>
          <p className="meta">{localizedSplitModeHelper(form.splitMode)}</p>
        </div>

        {form.splitMode === "FULL_BY_ONE" ? (
          <label>
            {t("Paying guest", "Odeyen misafir")}
            <select
              value={form.payerGuestId}
              onChange={(event) => setForm((prev) => ({ ...prev, payerGuestId: event.target.value }))}
              required
            >
              <option value="">{t("Select guest", "Misafir secin")}</option>
              {selectedSession?.guests.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button type="submit" disabled={isCalculating || !form.sessionId || !selectedSession}>
          {isCalculating ? t("Calculating...", "Hesaplaniyor...") : t("Calculate check", "Hesabi hesapla")}
        </button>
        {invoiceError ? <p className="status-banner is-error">{invoiceError}</p> : null}
      </form>

      {invoice ? (
        <section className="panel stack-md invoice-result-panel">
          {isCalculating ? <p className="status-banner is-neutral">{t("Refreshing check summary.", "Hesap ozeti yenileniyor.")}</p> : null}

          <div className="section-head">
            <div className="section-copy">
              <p className="section-kicker">{t("Check", "Hesap")}</p>
              <h3>{formatInvoiceNumber(invoice.id, invoice.createdAt)}</h3>
              <p className="panel-subtitle">{t("The check summary stays visible during payment preparation.", "Odeme hazirligi sirasinda hesap ozeti gorunur kalir.")}</p>
            </div>
            <span className="badge badge-outline">{localizedSplitModeLabel(invoice.splitMode)}</span>
          </div>

          <div className="invoice-total-card">
            <p className="dashboard-stat-label">{t("Total check", "Toplam hesap")}</p>
            <p className="invoice-total-value">{formatTryCurrency(invoice.total)}</p>
            <p className="dashboard-stat-note">
              {t(`${invoice.splits.length} payment share(s), ${invoice.lines.length} line item(s).`, `${invoice.splits.length} odeme payi, ${invoice.lines.length} satir urun.`)}
            </p>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">{t("Split mode", "Bolme modu")}</span>
              <span className="detail-value">{localizedSplitModeLabel(invoice.splitMode)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Average per person", "Kisi basi ortalama")}</span>
              <span className="detail-value">{formatTryCurrency(invoiceAverageShare)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Assigned amount", "Atanan tutar")}</span>
              <span className="detail-value">{formatTryCurrency(invoiceSplitTotal)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Unassigned amount", "Atanmayan tutar")}</span>
              <span className="detail-value">{formatTryCurrency(invoiceUnassignedAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Calculated at", "Hesaplama saati")}</span>
              <span className="detail-value">{formatDateTime(invoice.createdAt)}</span>
            </div>
          </div>

          <div className="prepare-payment-panel stack-md">
            <div className="section-copy">
              <h4>{isPaymentSessionSettled ? t("Payment complete", "Odeme tamamlandi") : t("Prepare payments", "Odemeleri hazirla")}</h4>
              {isPaymentSessionSettled ? (
                <p className="helper-text">
                  {t("This table has been fully paid. The settled receipt is the remaining cashier record for export.", "Bu masa tamamen odendi. Tamamlanan fis, disa aktarma icin kalan kasiyer kaydidir.")}
                </p>
              ) : (
                <p className="helper-text">
                  {t("Create payment shares after the check is calculated. Cash, card, and online-link actions can all be managed from this screen for TRY payments.", "Hesap hesaplandiktan sonra odeme paylarini olusturun. Nakit, kart ve online link islemleri TRY odemeleri icin bu ekrandan yonetilir.")}
                </p>
              )}
            </div>

            {isPaymentSessionSettled ? (
              <div className="ticket-actions">
                {settledReceipt ? (
                  <>
                    <button type="button" className="ticket-action-btn" onClick={() => handleDownloadPaperReceipt(settledReceipt)}>
                      {t("Download receipt", "Fisi indir")}
                    </button>
                    <button type="button" className="ticket-action-btn" onClick={() => handlePrintPaperReceipt(settledReceipt)}>
                      {t("Print receipt", "Fisi yazdir")}
                    </button>
                    <button type="button" className="ticket-action-btn" onClick={() => handleExportReceipt(settledReceipt)}>
                      {t("Export Excel", "Excel aktar")}
                    </button>
                  </>
                ) : (
                  <button type="button" className="ticket-action-btn" onClick={() => loadData({ silent: true })}>
                    {t("Refresh receipts", "Fisleri yenile")}
                  </button>
                )}
              </div>
            ) : (
              <div className="ticket-actions">
                <button
                  type="button"
                  className="ticket-action-btn"
                  onClick={handlePreparePayment}
                  disabled={isPreparingPayment}
                >
                  {isPreparingPayment ? t("Preparing...", "Hazirlaniyor...") : t("Create payment shares", "Odeme paylarini olustur")}
                </button>
              </div>
            )}
          </div>

          {paymentSessionNotice ? <p className="status-banner is-success">{paymentSessionNotice}</p> : null}
          {paymentSessionError ? <p className="status-banner is-error">{paymentSessionError}</p> : null}

          {paymentSession && !isPaymentSessionSettled ? (
            <div className="settlement-desk stack-md">
              <div className="section-head">
                <div className="section-copy">
                  <p className="section-kicker">{t("Payment tracking", "Odeme takibi")}</p>
                  <h4>{t("Payment shares", "Odeme paylari")}</h4>
                  <p className="helper-text">{t("Start collection for each share, complete pending ones, and monitor the remaining amount.", "Her pay icin tahsilati baslatin, bekleyenleri tamamlayin ve kalan tutari izleyin.")}</p>
                </div>
                <span className={`badge ${paymentSessionStatusBadgeClass(paymentSession.status)}`}>
                  {localizedStatusLabel(paymentSession.status)}
                </span>
              </div>

              {paymentSession.session?.readyToCloseAt ? (
                <p className="status-banner is-success">
                  {t(`Table ${paymentSession.session.table?.name ?? selectedSession?.table.name ?? ""} is ready to close. Time: ${formatDateTime(paymentSession.session.readyToCloseAt)}.`, `Masa ${paymentSession.session.table?.name ?? selectedSession?.table.name ?? ""} kapatmaya hazir. Saat: ${formatDateTime(paymentSession.session.readyToCloseAt)}.`)}
                </p>
              ) : null}

              {paymentSummary ? (
                <div className="grid-4 checkout-summary-grid">
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">{t("Total amount", "Toplam tutar")}</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.totalAmount)}</p>
                    <p className="dashboard-stat-note">{t("Total TRY amount to collect.", "Tahsil edilecek toplam TRY tutari.")}</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">{t("Paid amount", "Odenen tutar")}</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.paidAmount)}</p>
                    <p className="dashboard-stat-note">{t("Collected payment shares.", "Tahsil edilen odeme paylari.")}</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">{t("Remaining amount", "Kalan tutar")}</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.remainingAmount)}</p>
                    <p className="dashboard-stat-note">{t("TRY balance still waiting for collection.", "Hala tahsilat bekleyen TRY bakiyesi.")}</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">{t("Open shares", "Acik paylar")}</p>
                    <p className="dashboard-stat-value">{paymentSummary.unpaidShareCount}</p>
                    <p className="dashboard-stat-note">
                      {t(`Pending ${paymentSummary.pendingShareCount} | Failed ${paymentSummary.failedShareCount}`, `Bekleyen ${paymentSummary.pendingShareCount} | Basarisiz ${paymentSummary.failedShareCount}`)}
                    </p>
                  </article>
                </div>
              ) : null}

              <div className="section-copy">
                <h4>{t("Generated payment shares", "Olusan odeme paylari")}</h4>
                <p className="helper-text">{t("Each card shows payer, amount, payment status, and cashier actions.", "Her kartta odeyen, tutar, odeme durumu ve kasiyer aksiyonlari gorunur.")}</p>
              </div>

              <div className="checkout-share-grid">
                {paymentSession.shares.map((share) => {
                  const isPaid = share.status === "PAID";
                  const isPending = share.status === "PENDING";
                  const canStartPayment = share.status === "UNPAID" || share.status === "FAILED";
                  const canMarkFailedDirectly = share.status === "UNPAID";
                  const actionLocked = Boolean(runningShareAction) || isPreparingPayment;

                  return (
                    <article key={share.id} className={`checkout-share-card stack-md${isPaid ? " is-paid" : ""}`}>
                      <div className="checkout-share-head">
                        <div className="checkout-share-copy">
                          <p className="checkout-share-payer">{share.payerLabel}</p>
                          <p className="meta">{share.guest ? t(`Guest: ${share.guest.displayName}`, `Misafir: ${share.guest.displayName}`) : t("Table-level payer", "Masa duzeyi odeyen")}</p>
                        </div>
                        <p className="checkout-share-amount">{formatTryCurrency(share.amount)}</p>
                      </div>

                      <div className="badge-row">
                        <span className={`badge ${paymentShareStatusBadgeClass(share.status)}`}>
                          {localizedStatusLabel(share.status)}
                        </span>
                        {share.provider ? <span className="badge badge-outline">{localizedProviderLabel(share.provider)}</span> : null}
                        {Number(share.tip) > 0 ? <span className="badge badge-neutral">{t("Tip", "Bahsis")} {formatTryCurrency(share.tip)}</span> : null}
                        {share.paidAt ? <span className="badge badge-neutral">{t("Paid", "Odendi")} {formatShortTime(share.paidAt)}</span> : null}
                      </div>

                      {share.paymentUrl ? (
                        <p className="helper-text">
                          {t("Online payment link is ready:", "Online odeme linki hazir:")}{" "}
                          <a className="checkout-link" href={share.paymentUrl} target="_blank" rel="noreferrer">
                            {t("Open payment page", "Odeme sayfasini ac")}
                          </a>
                        </p>
                      ) : null}

                      {share.paidAt ? <p className="meta">{t("Completed at", "Tamamlanma saati")}: {formatDateTime(share.paidAt)}</p> : null}

                      {canStartPayment ? (
                        <div className="ticket-actions">
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "PAY_BY_CASH")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "PAY_BY_CASH") ? t("Starting cash...", "Nakit baslatiliyor...") : t("Collect cash", "Nakit tahsil et")}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "PAY_BY_CARD")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "PAY_BY_CARD") ? t("Starting card...", "Kart baslatiliyor...") : t("Collect card", "Kart tahsil et")}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "SEND_ONLINE_LINK")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "SEND_ONLINE_LINK")
                              ? t("Sending link...", "Link gonderiliyor...")
                              : t("Send payment link", "Odeme linki gonder")}
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
                              ? t("Completing...", "Tamamlaniyor...")
                              : t("Complete payment", "Odemeyi tamamla")}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn warn"
                            onClick={() => handleShareAction(share.id, "MARK_PAYMENT_FAILED")}
                            disabled={actionLocked}
                          >
                            {isShareActionRunning(share.id, "MARK_PAYMENT_FAILED") ? t("Updating...", "Guncelleniyor...") : t("Mark as failed", "Basarisiz olarak isaretle")}
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
                              ? t("Updating...", "Guncelleniyor...")
                              : t("Mark mock failure", "Test hatasi olarak isaretle")}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isPaymentSessionSettled ? (
          <div className="grid-2">
            <div>
              <div className="section-copy">
                <h4>{t("Guest payment shares", "Misafir odeme paylari")}</h4>
                <p className="helper-text">{t("Review share distribution before collecting payments.", "Tahsilat oncesinde pay dagilimini inceleyin.")}</p>
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
                      <p className="meta">{t(`${formatPercentage(sharePercent)} of total check`, `Toplam hesabin ${formatPercentage(sharePercent)} kadari`)}</p>
                      {guestBreakdown ? (
                        <p className="meta">
                          {t(`Ordered items: ${guestBreakdown.itemCount} item(s), ${formatTryCurrency(guestBreakdown.orderedTotal)}`, `Siparis urunleri: ${guestBreakdown.itemCount} urun, ${formatTryCurrency(guestBreakdown.orderedTotal)}`)}
                        </p>
                      ) : null}
                      {shareDiffersFromOwnItems ? (
                        <p className="meta">{t("Share amount differs from ordered-item subtotal because split mode is not by guest items.", "Pay tutari, bolme modu misafir urunlerine gore olmadigi icin siparis alt toplami ile farklidir.")}</p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="section-copy">
                <h4>{t("Check line items", "Hesap satirlari")}</h4>
                <p className="helper-text">{t("Items that make up the total check.", "Toplam hesabi olusturan urunler.")}</p>
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
                        {t("Qty", "Adet")} {resolveInvoiceLineQuantity(line)} x {formatTryCurrency(line.unitPrice)}
                      </p>
                    ) : null}
                    <p className="meta">{line.guest ? t(`Assigned: ${line.guest.displayName}`, `Atanan: ${line.guest.displayName}`) : t("Shared line item", "Paylasilan satir")}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          ) : null}
        </section>
      ) : (
        <section className="panel">
          <p className="empty empty-state">{t("No check has been calculated yet. Start by selecting an open session and split mode.", "Henuz hesap hesaplanmadi. Acik oturum ve bolme modunu secerek baslayin.")}</p>
        </section>
      )}

      <section className="panel stack-md receipt-archive-panel">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">{t("Receipt archive", "Fis arsivi")}</p>
            <h3>{t("Settled receipts", "Tamamlanan fisler")}</h3>
            <p className="panel-subtitle">{t("Paid checks stay available here after the table closes.", "Odenen hesaplar masa kapandiktan sonra burada gorunur kalir.")}</p>
          </div>
          <div className="ticket-actions receipt-archive-actions">
            <button type="button" className="ticket-action-btn" onClick={handleExportAllReceipts} disabled={receiptArchiveReceipts.length === 0}>
              {t("Export all Excel", "Tumunu Excel aktar")}
            </button>
            {settledReceipt ? (
              <>
                <button type="button" className="ticket-action-btn" onClick={() => handlePrintPaperReceipt(settledReceipt)}>
                  {t("Print receipt", "Fisi yazdir")}
                </button>
                <button type="button" className="ticket-action-btn" onClick={() => handleDownloadPaperReceipt(settledReceipt)}>
                  {t("Download receipt", "Fisi indir")}
                </button>
                <button type="button" className="ticket-action-btn" onClick={() => handleExportReceipt(settledReceipt)}>
                  {t("Export receipt", "Fisi aktar")}
                </button>
              </>
            ) : null}
            <button type="button" className="ticket-action-btn" onClick={() => loadData()}>
              {t("Refresh", "Yenile")}
            </button>
          </div>
        </div>

        <div className="dashboard-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Receipts", "Fisler")}</p>
            <p className="dashboard-stat-value">{receiptSummary.count}</p>
            <p className="dashboard-stat-note">{t("Fully settled checks.", "Tamamen tamamlanan hesaplar.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Collected", "Tahsil edilen")}</p>
            <p className="dashboard-stat-value">{formatTryCurrency(receiptSummary.collectedAmount)}</p>
            <p className="dashboard-stat-note">{t("Payments plus tips.", "Odemeler ve bahsisler.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Tips", "Bahsisler")}</p>
            <p className="dashboard-stat-value">{formatTryCurrency(receiptSummary.tipAmount)}</p>
            <p className="dashboard-stat-note">{t("Tip total in archive.", "Arsivdeki toplam bahsis.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Last paid", "Son odeme")}</p>
            <p className="dashboard-stat-value">{receiptSummary.lastPaidAt ? formatShortTime(receiptSummary.lastPaidAt) : "-"}</p>
            <p className="dashboard-stat-note">
              {receiptSummary.lastPaidAt ? formatDateTime(receiptSummary.lastPaidAt) : t("No receipt yet.", "Henuz fis yok.")}
            </p>
          </article>
        </div>

        <div className="status-stack">
          {receiptError ? <p className="status-banner is-error">{receiptError}</p> : null}
          {exportError ? <p className="status-banner is-error">{exportError}</p> : null}
        </div>

        {receiptTableGroups.length > 0 ? (
          <div className="table-filter-bar" role="tablist" aria-label={t("Filter receipts by table", "Fisleri masaya gore filtrele")}>
            <button
              type="button"
              className={`table-filter-chip${receiptTableFilter === ALL_TABLES_KEY ? " is-active" : ""}`}
              onClick={() => setReceiptTableFilter(ALL_TABLES_KEY)}
              aria-pressed={receiptTableFilter === ALL_TABLES_KEY}
            >
              <span>{t("All tables", "Tum masalar")}</span>
              <span className="table-filter-chip-count">{receiptArchiveReceipts.length}</span>
            </button>
            {receiptTableGroups.map((group) => {
              const isActive = receiptTableFilter === group.key;

              return (
                <button
                  key={group.key}
                  type="button"
                  className={`table-filter-chip${isActive ? " is-active" : ""}`}
                  onClick={() => setReceiptTableFilter(group.key)}
                  aria-pressed={isActive}
                  title={`${group.branchName} - Table ${group.tableName}`}
                >
                  <span>{t(`Table ${group.tableName}`, `Masa ${group.tableName}`)}</span>
                  <span className="table-filter-chip-count">{group.count}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {receiptArchiveReceipts.length === 0 ? (
          <p className="empty empty-state">{t("No settled receipts yet. Completed payments will appear here after checkout.", "Henuz tamamlanan fis yok. Tamamlanan odemeler odemeden sonra burada gorunecek.")}</p>
        ) : filteredReceipts.length === 0 ? (
          <p className="empty empty-state">{t("No receipts for this table yet.", "Bu masa icin henuz fis yok.")}</p>
        ) : (
          <div className="receipt-list">
            {filteredReceipts.map((receipt) => {
              const receiptNumber = formatInvoiceNumber(receipt.invoiceId, receipt.createdAt);
              const isExpanded = expandedReceiptId === receipt.id;
              const paidShareCount = receipt.shares.filter((share) => share.status === "PAID").length;

              return (
                <article key={receipt.id} className="list-item entity-card receipt-card stack-md">
                  <div className="entity-top">
                    <div className="entity-title">
                      <h4>{receiptNumber}</h4>
                      <p className="entity-summary">
                        {receipt.branch?.name ?? t("Branch", "Sube")} | {t(`Table ${receipt.table?.name ?? "-"}`, `Masa ${receipt.table?.name ?? "-"}`)} | {formatDateTime(receipt.paidAt)}
                      </p>
                    </div>
                    <span className="badge badge-outline">{formatTryCurrency(receipt.collectedAmount)}</span>
                  </div>

                  <div className="badge-row">
                    <span className={`badge ${paymentSessionStatusBadgeClass(receipt.status)}`}>{localizedStatusLabel(receipt.status)}</span>
                    <span className="badge badge-neutral">{localizedSplitModeLabel(receipt.splitMode)}</span>
                    <span className="badge badge-neutral">
                      {t(`${paidShareCount}/${receipt.shares.length} paid shares`, `${paidShareCount}/${receipt.shares.length} odendi`)}
                    </span>
                    {receipt.table?.code ? <span className="badge badge-outline">{receipt.table.code}</span> : null}
                  </div>

                  <div className="detail-grid">
                    <div className="detail-card">
                      <span className="detail-label">{t("Subtotal", "Ara toplam")}</span>
                      <span className="detail-value">{formatTryCurrency(receipt.total)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">{t("Tips", "Bahsisler")}</span>
                      <span className="detail-value">{formatTryCurrency(receipt.tipAmount)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">{t("Collected", "Tahsil edilen")}</span>
                      <span className="detail-value">{formatTryCurrency(receipt.collectedAmount)}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">{t("Guests", "Misafirler")}</span>
                      <span className="detail-value">{receipt.guests.length}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">{t("Items", "Urunler")}</span>
                      <span className="detail-value">{receipt.lines.length}</span>
                    </div>
                    <div className="detail-card">
                      <span className="detail-label">{t("Payments", "Odemeler")}</span>
                      <span className="detail-value">{receipt.payments.length}</span>
                    </div>
                  </div>

                  <div className="ticket-actions">
                    <button type="button" className="ticket-action-btn" onClick={() => handleDownloadPaperReceipt(receipt)}>
                      {t("Download receipt", "Fisi indir")}
                    </button>
                    <button type="button" className="ticket-action-btn" onClick={() => handlePrintPaperReceipt(receipt)}>
                      {t("Print receipt", "Fisi yazdir")}
                    </button>
                    <button type="button" className="ticket-action-btn" onClick={() => handleExportReceipt(receipt)}>
                      {t("Export Excel", "Excel aktar")}
                    </button>
                    <button
                      type="button"
                      className="ticket-action-btn"
                      onClick={() => setExpandedReceiptId(isExpanded ? null : receipt.id)}
                    >
                      {isExpanded ? t("Hide receipt", "Fisi gizle") : t("View receipt", "Fisi goruntule")}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="receipt-details">
                      <div className="receipt-detail-column">
                        <h4>{t("Items", "Urunler")}</h4>
                        <div className="receipt-row-list">
                          {receipt.lines.map((line) => (
                            <div key={line.id} className="receipt-row">
                              <div>
                                <strong>{line.itemName ?? line.label}</strong>
                                <p className="meta">
                                  {line.guestName ? `${line.guestName} | ` : ""}
                                  {t("Qty", "Adet")} {line.quantity ?? 1}
                                  {line.unitPrice ? ` x ${formatTryCurrency(line.unitPrice)}` : ""}
                                </p>
                              </div>
                              <strong>{formatTryCurrency(line.amount)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="receipt-detail-column">
                        <h4>{t("Payments", "Odemeler")}</h4>
                        <div className="receipt-row-list">
                          {receipt.shares.map((share) => (
                            <div key={share.id} className="receipt-row">
                              <div>
                                <strong>{share.payerLabel}</strong>
                                <p className="meta">
                                  {share.provider ? localizedProviderLabel(share.provider) : t("Payment", "Odeme")} |{" "}
                                  {localizedStatusLabel(share.status)}
                                  {share.providerPaymentId ? ` | ${share.providerPaymentId}` : ""}
                                </p>
                                {Number(share.tip) > 0 ? <p className="meta">{t("Tip", "Bahsis")} {formatTryCurrency(share.tip)}</p> : null}
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
