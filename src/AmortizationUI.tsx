import React, { useMemo, useState, useEffect } from "react";

const LS_KEY = "amortization-ui-state-v1";
const DEFAULT_START_YEAR = 2026;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const numberInputFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function roundMoney(n: number) {
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function nonNegative(n: number) {
  return isFinite(n) ? Math.max(0, n) : 0;
}

function normalizeMonth(month: number) {
  return Math.min(12, Math.max(1, Math.floor(nonNegative(month)) || 1));
}

function normalizeYear(year: number) {
  return Math.floor(nonNegative(year)) || DEFAULT_START_YEAR;
}

function formatMonthYear(startMonth: number, startYear: number, paymentNumber: number) {
  const monthIndex = normalizeMonth(startMonth) - 1 + Math.max(0, paymentNumber - 1);
  const year = normalizeYear(startYear) + Math.floor(monthIndex / 12);
  const month = MONTH_NAMES[monthIndex % 12];
  return `${month}-${year}`;
}

function formatCurrency(n: number) {
  if (!isFinite(n)) return "-";
  return mxn.format(roundMoney(n));
}

function formatAmountInput(v: string) {
  const digits = v.toString().replace(/\D/g, "");
  if (!digits) return "";
  return numberInputFormatter.format(Number(digits));
}

function toNumber(v: string) {
  if (v === "" || v === null || v === undefined) return 0;
  const cleaned = v.toString().replace(/[^0-9,.-]/g, "").replace(/,/g, "");
  return Number(cleaned);
}

function CreatorLogo() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 32 32" role="img" aria-label="Creator logo">
      <circle cx="16" cy="16" r="15" fill="#fff7ed" stroke="#111827" strokeWidth="1.4" />
      <path d="M7 14.5C9.2 10.3 11.8 8 16 8s6.8 2.3 9 6.5" fill="#fbbf24" stroke="#111827" strokeWidth="1.5" />
      <path d="M4.5 13.5c3.9-2.4 7.8-3.6 11.5-3.6s7.6 1.2 11.5 3.6c.7.4.6 1.6-.1 1.9-7.4 2.9-15.4 2.9-22.8 0-.7-.3-.8-1.5-.1-1.9Z" fill="#ef4444" stroke="#111827" strokeWidth="1.4" />
      <path d="M6.5 14.5c6.3 2 12.7 2 19 0" fill="none" stroke="#16a34a" strokeWidth="1.4" />
      <circle cx="16" cy="19" r="7.2" fill="#f59e0b" stroke="#111827" strokeWidth="1.4" />
      <path d="M11.7 18.8c.7-.7 1.6-.7 2.3 0M18 18.8c.7-.7 1.6-.7 2.3 0" fill="none" stroke="#111827" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M13.1 22.3c1.6 1.4 4.2 1.4 5.8 0" fill="none" stroke="#111827" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M13 25.6l3-2 3 2" fill="#dc2626" stroke="#111827" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

interface Row {
  pago: number;
  monthYear: string;
  saldo: number;
  interes: number;
  iva: number;
  amort: number;
  mensualidadSinAcc: number;
  seguros: number;
  gastos: number;
  pagoMensual: number;
  prepago: number;
  totalCashFlow: number;
}

type Sistema = "frances" | "aleman";

type IvaBase = "ninguno" | "accesorios" | "interes+accesorios";

function buildSchedule(
  principal: number,
  annualRatePct: number,
  months: number,
  sistema: Sistema,
  seguroMensual: number,
  gastosMensuales: number,
  ivaPct: number,
  ivaBase: IvaBase,
  startMonth = 1,
  startYear = DEFAULT_START_YEAR,
  prepagos?: Record<number, number>
): Row[] {
  const principalAmount = roundMoney(nonNegative(principal));
  const termMonths = Math.max(1, Math.floor(nonNegative(months)));
  const monthlyRate = nonNegative(annualRatePct) / 100 / 12;
  const insurance = roundMoney(nonNegative(seguroMensual));
  const adminFees = roundMoney(nonNegative(gastosMensuales));
  const vatRate = nonNegative(ivaPct) / 100;
  const scheduleStartMonth = normalizeMonth(startMonth);
  const scheduleStartYear = normalizeYear(startYear);

  let saldo = principalAmount;
  const rows: Row[] = [];

  const fixedPayment =
    sistema === "frances"
      ? roundMoney(
          monthlyRate > 0
            ? (principalAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
            : principalAmount / termMonths
        )
      : 0;
  const fixedPrincipal = sistema === "aleman" ? roundMoney(principalAmount / termMonths) : 0;

  for (let k = 1; k <= termMonths; k++) {
    if (saldo <= 0) break;

    const openingBalance = roundMoney(saldo);
    const interest = roundMoney(openingBalance * monthlyRate);
    let paymentBeforeFees = 0;
    let principalPayment = 0;

    if (sistema === "frances") {
      paymentBeforeFees = fixedPayment;
      principalPayment = roundMoney(paymentBeforeFees - interest);
      if (principalPayment < 0) principalPayment = 0;
    } else {
      principalPayment = fixedPrincipal;
      paymentBeforeFees = roundMoney(interest + principalPayment);
    }

    if (k === termMonths || principalPayment > openingBalance) {
      principalPayment = openingBalance;
      paymentBeforeFees = roundMoney(interest + principalPayment);
    }

    const maxPrepayment = Math.max(0, roundMoney(openingBalance - principalPayment));
    const prepayment = roundMoney(Math.min(nonNegative(prepagos?.[k] ?? 0), maxPrepayment));

    let vatBase = 0;
    if (ivaBase === "accesorios") vatBase = insurance + adminFees;
    if (ivaBase === "interes+accesorios") vatBase = interest + insurance + adminFees;
    const vat = roundMoney(vatRate * vatBase);

    const monthlyPayment = roundMoney(paymentBeforeFees + insurance + adminFees + vat);
    const totalCashFlow = roundMoney(monthlyPayment + prepayment);

    rows.push({
      pago: k,
      monthYear: formatMonthYear(scheduleStartMonth, scheduleStartYear, k),
      saldo: openingBalance,
      interes: interest,
      iva: vat,
      amort: principalPayment,
      mensualidadSinAcc: paymentBeforeFees,
      seguros: insurance,
      gastos: adminFees,
      pagoMensual: monthlyPayment,
      prepago: prepayment,
      totalCashFlow,
    });

    saldo = roundMoney(openingBalance - principalPayment - prepayment);
  }

  return rows;
}

export default function AmortizationUI() {
  const [monto, setMonto] = useState<string>("0");
  const [tasa, setTasa] = useState<string>("11.7");
  const [meses, setMeses] = useState<string>("120");
  const [sistema, setSistema] = useState<Sistema>("frances");
  const [startMonth, setStartMonth] = useState<string>("1");
  const [startYear, setStartYear] = useState<string>(String(DEFAULT_START_YEAR));

  const [seguro, setSeguro] = useState<string>("1050");
  const [gastos, setGastos] = useState<string>("175");
  const [ivaPct, setIvaPct] = useState<string>("0");
  const [ivaBase, setIvaBase] = useState<IvaBase>("ninguno");
  const [prepagos, setPrepagos] = useState<Record<number, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === "object") {
          if (s.monto !== undefined) setMonto(String(s.monto));
          if (s.tasa !== undefined) setTasa(String(s.tasa));
          if (s.meses !== undefined) setMeses(String(s.meses));
          if (s.sistema !== undefined) setSistema(s.sistema as Sistema);
          if (s.startMonth !== undefined) setStartMonth(String(normalizeMonth(Number(s.startMonth))));
          if (s.startYear !== undefined) setStartYear(String(normalizeYear(Number(s.startYear))));
          if (s.seguro !== undefined) setSeguro(String(s.seguro));
          if (s.gastos !== undefined) setGastos(String(s.gastos));
          if (s.ivaPct !== undefined) setIvaPct(String(s.ivaPct));
          if (s.ivaBase !== undefined) setIvaBase(s.ivaBase as IvaBase);
          if (s.prepagos && typeof s.prepagos === "object") setPrepagos(s.prepagos);
        }
      }
    } catch {}
    finally { setHydrated(true); }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const data = { monto, tasa, meses, sistema, startMonth, startYear, seguro, gastos, ivaPct, ivaBase, prepagos };
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
  }, [hydrated, monto, tasa, meses, sistema, startMonth, startYear, seguro, gastos, ivaPct, ivaBase, prepagos]);

  const P = nonNegative(toNumber(monto));
  const n = Math.max(1, Math.floor(nonNegative(toNumber(meses))));
  const rate = nonNegative(Number(tasa));
  const scheduleStartMonth = normalizeMonth(Number(startMonth));
  const scheduleStartYear = normalizeYear(Number(startYear));
  const prepagosNum = useMemo(() => {
    const entries = Object.entries(prepagos).map(([k, v]) => [Number(k), nonNegative(toNumber(v))] as const);
    return Object.fromEntries(entries);
  }, [prepagos]);

  const rows = useMemo(
    () =>
      buildSchedule(
        P,
        rate,
        n,
        sistema,
        toNumber(seguro),
        toNumber(gastos),
        Number(ivaPct),
        ivaBase,
        scheduleStartMonth,
        scheduleStartYear,
        prepagosNum
      ),
    [P, rate, n, sistema, seguro, gastos, ivaPct, ivaBase, scheduleStartMonth, scheduleStartYear, prepagosNum]
  );

  const totales = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.interes += r.interes;
        acc.iva += r.iva;
        acc.amort += r.amort;
        acc.seguro += r.seguros;
        acc.gastos += r.gastos;
        acc.pago += r.totalCashFlow;
        acc.prepago += r.prepago;
        return acc;
      },
      { interes: 0, iva: 0, amort: 0, seguro: 0, gastos: 0, pago: 0, prepago: 0 }
    );
  }, [rows]);

  const rowsBase = useMemo(
    () =>
      buildSchedule(
        P,
        rate,
        n,
        sistema,
        toNumber(seguro),
        toNumber(gastos),
        Number(ivaPct),
        ivaBase,
        scheduleStartMonth,
        scheduleStartYear
      ),
    [P, rate, n, sistema, seguro, gastos, ivaPct, ivaBase, scheduleStartMonth, scheduleStartYear]
  );

  const interesesBase = useMemo(() => rowsBase.reduce((acc, r) => acc + r.interes, 0), [rowsBase]);
  const interesesAhorrados = Math.max(0, roundMoney(interesesBase - totales.interes));
  const mesesAhorrados = Math.max(0, rowsBase.length - rows.length);

  function descargarCSV() {
    const header = [
      "# PAYMENT",
      "MONTH & YEAR",
      "OUTSTANDING BALANCE",
      "INTEREST",
      "VAT",
      "PRINCIPAL",
      "PAYMENT BEFORE FEES",
      "LIFE AND PROPERTY INSURANCE",
      "ADMIN FEES",
      "MONTHLY PAYMENT",
      "PREPAYMENT",
      "TOTAL CASH FLOW",
    ];

    const lines = rows.map((r) => [
      r.pago,
      r.monthYear,
      r.saldo,
      r.interes,
      r.iva,
      r.amort,
      r.mensualidadSinAcc,
      r.seguros,
      r.gastos,
      r.pagoMensual,
      r.prepago,
      r.totalCashFlow,
    ]);

    const csv = [header.join(","), ...lines.map((l) => l.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "amortization_schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-screen-2xl mx-auto p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl font-semibold">Dynamic amortization schedule</h1>
          <p className="flex items-center gap-2 text-sm font-medium text-slate-500 sm:text-right">
            <span>Application created by Jorge Caballero</span>
            <CreatorLogo />
          </p>
        </div>

        <div className="grid gap-4 mb-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <div className="min-w-0 bg-white rounded-2xl shadow p-4">
            <label className="block text-sm text-slate-600 mb-1">Loan amount</label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={formatAmountInput(monto)}
              onChange={(e) => setMonto(formatAmountInput(e.target.value))}
            />
          </div>

          <div className="min-w-0 bg-white rounded-2xl shadow p-4">
            <label className="block text-sm text-slate-600 mb-1">Annual rate (%)</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              min={0}
              step="0.01"
            />
            <p className="text-xs text-slate-500 mt-1">Monthly approx. {(rate / 12).toFixed(3)}%</p>
          </div>

          <div className="min-w-0 bg-white rounded-2xl shadow p-4">
            <label className="block text-sm text-slate-600 mb-1">Term (months)</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={meses}
              onChange={(e) => setMeses(e.target.value)}
              min={1}
            />
            <div className="mt-2 grid gap-1">
              <label className="text-xs text-slate-600">System</label>
              <select
                className="w-full min-w-0 text-sm rounded-lg border border-slate-300 px-2 py-2"
                value={sistema}
                onChange={(e) => setSistema(e.target.value as Sistema)}
              >
                <option value="frances">French (fixed payment)</option>
                <option value="aleman">German (fixed principal)</option>
              </select>
            </div>
          </div>

          <div className="min-w-0 bg-white rounded-2xl shadow p-4">
            <label className="block text-sm text-slate-600 mb-1">Credit start date</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <span className="text-xs text-slate-500">Month</span>
                <select
                  className="w-full min-w-0 text-sm rounded-xl border border-slate-300 px-2 py-2"
                  value={String(scheduleStartMonth)}
                  onChange={(e) => setStartMonth(e.target.value)}
                >
                  {MONTH_NAMES.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <span className="text-xs text-slate-500">Year</span>
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                  min={1900}
                  step="1"
                />
              </div>
            </div>
          </div>

          <div className="min-w-0 bg-white rounded-2xl shadow p-4 md:col-span-2 xl:col-span-1">
            <label className="block text-sm text-slate-600 mb-1">Fees (monthly)</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <span className="text-xs text-slate-500">Insurance</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formatAmountInput(seguro)}
                  onChange={(e) => setSeguro(formatAmountInput(e.target.value))}
                />
              </div>
              <div className="min-w-0">
                <span className="text-xs text-slate-500">Admin fees</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formatAmountInput(gastos)}
                  onChange={(e) => setGastos(formatAmountInput(e.target.value))}
                />
              </div>
            </div>
            <div className="grid gap-3 mt-3 sm:grid-cols-2">
              <div className="min-w-0">
                <span className="text-xs text-slate-500">VAT (%)</span>
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={ivaPct}
                  onChange={(e) => setIvaPct(e.target.value)}
                  min={0}
                  step="0.01"
                />
              </div>
              <div className="min-w-0">
                <span className="text-xs text-slate-500">VAT base</span>
                <select
                  className="w-full min-w-0 text-sm rounded-xl border border-slate-300 px-2 py-2"
                  value={ivaBase}
                  onChange={(e) => setIvaBase(e.target.value as IvaBase)}
                >
                  <option value="ninguno">None</option>
                  <option value="accesorios">Fees</option>
                  <option value="interes+accesorios">Interest + fees</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 mb-6">
          <div className="grid md:grid-cols-9 gap-4 text-sm">
            <div>
              <div className="text-slate-500">Opening balance</div>
              <div className="font-semibold">{formatCurrency(P)}</div>
            </div>
            <div>
              <div className="text-slate-500">Total interest</div>
              <div className="font-semibold">{formatCurrency(totales.interes)}</div>
            </div>
            <div>
              <div className="text-slate-500">Total principal</div>
              <div className="font-semibold">{formatCurrency(totales.amort)}</div>
            </div>
            <div>
              <div className="text-slate-500">Fees + VAT</div>
              <div className="font-semibold">{formatCurrency(totales.seguro + totales.gastos + totales.iva)}</div>
            </div>
            <div>
              <div className="text-slate-500">Total paid</div>
              <div className="font-semibold">{formatCurrency(totales.pago)}</div>
            </div>
            <div>
              <div className="text-slate-500">Total prepayments</div>
              <div className="font-semibold">{formatCurrency(totales.prepago)}</div>
            </div>
            <div>
              <div className="text-slate-500">Effective months</div>
              <div className="font-semibold">{rows.length}</div>
            </div>
            <div>
              <div className="text-slate-500">Months saved</div>
              <div className="font-semibold">{mesesAhorrados}</div>
            </div>
            <div>
              <div className="text-slate-500">Interest saved (prepayments)</div>
              <div className="font-semibold">{formatCurrency(interesesAhorrados)}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={descargarCSV}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white text-sm px-4 py-2 shadow hover:bg-indigo-700"
          >
            Download CSV
          </button>
          <div className="text-xs text-slate-500">Amounts are rounded to cents per period.</div>
        </div>

        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-slate-500">Quick tests (dev)</summary>
          <div className="text-xs text-slate-600 mt-2">
            <button
              onClick={() => {
                const base = buildSchedule(P, rate, n, sistema, toNumber(seguro), toNumber(gastos), Number(ivaPct), ivaBase, scheduleStartMonth, scheduleStartYear);
                const baseInteres = base.reduce((a, r) => a + r.interes, 0);
                const con0 = buildSchedule(P, rate, n, sistema, toNumber(seguro), toNumber(gastos), Number(ivaPct), ivaBase, scheduleStartMonth, scheduleStartYear, {});
                const con0Interes = con0.reduce((a, r) => a + r.interes, 0);
                console.assert(Math.abs(baseInteres - con0Interes) < 1e-6, "[Test] Without prepayments, interest should stay the same");
                const conPrep = buildSchedule(P, rate, n, sistema, toNumber(seguro), toNumber(gastos), Number(ivaPct), ivaBase, scheduleStartMonth, scheduleStartYear, { 1: 10000 });
                const conPrepInteres = conPrep.reduce((a, r) => a + r.interes, 0);
                console.assert(conPrepInteres <= baseInteres, "[Test] With a prepayment, total interest should not increase");
                console.assert(conPrep.length <= base.length, "[Test] With a prepayment, effective months should not increase");
                const zeroRateFrench = buildSchedule(1200, 0, 12, "frances", 0, 0, 0, "ninguno", 1, 2026);
                console.assert(zeroRateFrench.length === 12, "[Test] A 0% French loan should still amortize across the term");
                console.assert(zeroRateFrench.every((r) => r.interes === 0 && r.amort === 100), "[Test] A 0% French loan should split principal evenly");
                console.assert(rows.every((r) => r.totalCashFlow === roundMoney(r.pagoMensual + r.prepago)), "[Test] Total cash flow should equal monthly payment plus prepayment");
                const datedRows = buildSchedule(1200, 0, 14, "frances", 0, 0, 0, "ninguno", 11, 2025);
                console.assert(datedRows[0]?.monthYear === "November-2025", "[Test] Month & Year should start with the selected month and year");
                console.assert(datedRows[2]?.monthYear === "January-2026", "[Test] Month & Year should roll over year boundaries");
                console.assert(formatAmountInput("1000") === "1,000", "[Test] Money inputs should format thousands with commas");
                console.assert(toNumber("1,000,000") === 1000000, "[Test] Formatted money inputs should parse as numbers");
                alert("Tests ran. Check the console (F12) for details.");
              }}
              className="mt-2 rounded-lg border px-2 py-1"
            >
              Run tests
            </button>
          </div>
        </details>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left"># PAYMENT</th>
                  <th className="px-3 py-2 text-left">MONTH & YEAR</th>
                  <th className="px-3 py-2 text-right">OUTSTANDING BALANCE</th>
                  <th className="px-3 py-2 text-right">INTEREST</th>
                  <th className="px-3 py-2 text-right">VAT</th>
                  <th className="px-3 py-2 text-right">PRINCIPAL</th>
                  <th className="px-3 py-2 text-right">PAYMENT BEFORE FEES</th>
                  <th className="px-3 py-2 text-right">LIFE AND PROPERTY INSURANCE</th>
                  <th className="px-3 py-2 text-right">ADMIN FEES</th>
                  <th className="px-3 py-2 text-right">MONTHLY PAYMENT</th>
                  <th className="px-3 py-2 text-right">PREPAYMENT</th>
                  <th className="px-3 py-2 text-right">TOTAL CASH FLOW</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pago} className={r.pago % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-3 py-2">{r.pago}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.monthYear}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.saldo)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.interes)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.iva)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.amort)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.mensualidadSinAcc)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.seguros)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.gastos)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.pagoMensual)}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-44 text-right rounded-lg border border-slate-300 px-2 py-1"
                        value={formatAmountInput(prepagos[r.pago] ?? "")}
                        onChange={(e) => setPrepagos((prev) => ({ ...prev, [r.pago]: formatAmountInput(e.target.value) }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{formatCurrency(r.totalCashFlow)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-3">
        </p>
      </div>
    </div>
  );
}
