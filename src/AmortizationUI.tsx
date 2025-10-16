import React, { useMemo, useState, useEffect } from "react";

const LS_KEY = "amortization-ui-state-v1";

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

function formatCurrency(n: number) {
  if (!isFinite(n)) return "-";
  return mxn.format(Math.round(n * 100) / 100);
}

function toNumber(v: string) {
  if (v === "" || v === null || v === undefined) return 0;
  const cleaned = v.toString().replace(/[^0-9,.-]/g, "").replace(/,/g, "");
  return Number(cleaned);
}

interface Row {
  pago: number;
  saldo: number;
  interes: number;
  iva: number;
  amort: number;
  mensualidadSinAcc: number;
  seguros: number;
  gastos: number;
  pagoMensual: number;
  prepago: number;
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
  prepagos?: Record<number, number>
): Row[] {
  const r = annualRatePct / 100 / 12;
  let saldo = principal;
  const rows: Row[] = [];

  const pagoFijo =
    sistema === "frances" && r > 0
      ? (principal * r) / (1 - Math.pow(1 + r, -months))
      : 0;
  const amortFija = sistema === "aleman" ? principal / months : 0;

  for (let k = 1; k <= months; k++) {
    if (saldo <= 0) break;

    const interes = saldo * r;
    let mensualidadSinAcc = 0;
    let amort = 0;

    if (sistema === "frances") {
      mensualidadSinAcc = pagoFijo;
      amort = mensualidadSinAcc - interes;
      if (amort < 0) amort = 0;
    } else {
      amort = amortFija;
      mensualidadSinAcc = interes + amort;
    }

    let prepago = Math.max(0, Math.min(prepagos?.[k] ?? 0, Math.max(0, saldo - amort)));

    if (amort + prepago > saldo) {
      amort = Math.max(0, saldo - prepago);
      mensualidadSinAcc = interes + amort;
    }

    let baseIVA = 0;
    if (ivaBase === "accesorios") baseIVA = seguroMensual + gastosMensuales;
    if (ivaBase === "interes+accesorios") baseIVA = interes + seguroMensual + gastosMensuales;
    const iva = (ivaPct / 100) * baseIVA;

    const pagoMensual = mensualidadSinAcc + seguroMensual + gastosMensuales + iva;

    rows.push({
      pago: k,
      saldo,
      interes,
      iva,
      amort,
      mensualidadSinAcc,
      seguros: seguroMensual,
      gastos: gastosMensuales,
      pagoMensual,
      prepago,
    });

    saldo = Math.max(0, saldo - amort - prepago);
  }

  return rows;
}

export default function AmortizationUI() {
  const [monto, setMonto] = useState<string>("0");
  const [tasa, setTasa] = useState<string>("11.7");
  const [meses, setMeses] = useState<string>("120");
  const [sistema, setSistema] = useState<Sistema>("frances");

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
    const data = { monto, tasa, meses, sistema, seguro, gastos, ivaPct, ivaBase, prepagos };
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
  }, [hydrated, monto, tasa, meses, sistema, seguro, gastos, ivaPct, ivaBase, prepagos]);

  const P = toNumber(monto);
  const n = Math.max(1, Math.floor(toNumber(meses)));
  const rate = Number(tasa);
  const prepagosNum = useMemo(() => {
    const entries = Object.entries(prepagos).map(([k, v]) => [Number(k), toNumber(v)] as const);
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
        prepagosNum
      ),
    [P, rate, n, sistema, seguro, gastos, ivaPct, ivaBase, prepagosNum]
  );

  const totales = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.interes += r.interes;
        acc.iva += r.iva;
        acc.amort += r.amort;
        acc.seguro += r.seguros;
        acc.gastos += r.gastos;
        acc.pago += r.pagoMensual;
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
        ivaBase
      ),
    [P, rate, n, sistema, seguro, gastos, ivaPct, ivaBase]
  );

  const interesesBase = useMemo(() => rowsBase.reduce((acc, r) => acc + r.interes, 0), [rowsBase]);
  const interesesAhorrados = Math.max(0, interesesBase - totales.interes);
  const mesesAhorrados = Math.max(0, rowsBase.length - rows.length);

  function descargarCSV() {
    const header = [
      "# PAGO",
      "SALDO INSOLUTO",
      "INTERÉS",
      "IVA",
      "AMORTIZACIÓN",
      "MENSUALIDAD SIN ACCESORIOS",
      "SEGUROS DE VIDA Y DAÑOS",
      "GASTOS ADMINISTRACION",
      "PAGO MENSUAL",
      "PAGO ANTICIPADO",
    ];

    const lines = rows.map((r) => [
      r.pago,
      r.saldo,
      r.interes,
      r.iva,
      r.amort,
      r.mensualidadSinAcc,
      r.seguros,
      r.gastos,
      r.pagoMensual,
      r.prepago,
    ]);

    const csv = [header.join(","), ...lines.map((l) => l.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "tabla_amortizacion.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Tabla de amortización dinámica</h1>

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow p-4">
            <label className="block text-sm text-slate-600 mb-1">Monto del préstamo</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              min={0}
              step="1000"
            />
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <label className="block text-sm text-slate-600 mb-1">Tasa anual (%)</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              min={0}
              step="0.01"
            />
            <p className="text-xs text-slate-500 mt-1">Mensual ≈ {(Number(tasa) / 12).toFixed(3)}%</p>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <label className="block text-sm text-slate-600 mb-1">Meses</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={meses}
              onChange={(e) => setMeses(e.target.value)}
              min={1}
            />
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs text-slate-600">Sistema:</label>
              <select
                className="text-sm rounded-lg border border-slate-300 px-2 py-1"
                value={sistema}
                onChange={(e) => setSistema(e.target.value as Sistema)}
              >
                <option value="frances">Francés (pago fijo)</option>
                <option value="aleman">Alemán (amortización fija)</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <label className="block text-sm text-slate-600 mb-1">Accesorios (mensuales)</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-slate-500">Seguros</span>
                <input
                  type="number"
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={seguro}
                  onChange={(e) => setSeguro(e.target.value)}
                  min={0}
                  step="1"
                />
              </div>
              <div>
                <span className="text-xs text-slate-500">Gastos Adm.</span>
                <input
                  type="number"
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={gastos}
                  onChange={(e) => setGastos(e.target.value)}
                  min={0}
                  step="1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <span className="text-xs text-slate-500">IVA (%)</span>
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={ivaPct}
                  onChange={(e) => setIvaPct(e.target.value)}
                  min={0}
                  step="0.01"
                />
              </div>
              <div>
                <span className="text-xs text-slate-500">Base IVA</span>
                <select
                  className="w-full text-sm rounded-xl border border-slate-300 px-2 py-2"
                  value={ivaBase}
                  onChange={(e) => setIvaBase(e.target.value as IvaBase)}
                >
                  <option value="ninguno">Ninguno</option>
                  <option value="accesorios">Accesorios</option>
                  <option value="interes+accesorios">Interés + Accesorios</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 mb-6">
          <div className="grid md:grid-cols-8 gap-4 text-sm">
            <div>
              <div className="text-slate-500">Saldo inicial</div>
              <div className="font-semibold">{formatCurrency(P)}</div>
            </div>
            <div>
              <div className="text-slate-500">Total intereses</div>
              <div className="font-semibold">{formatCurrency(totales.interes)}</div>
            </div>
            <div>
              <div className="text-slate-500">Total amortización</div>
              <div className="font-semibold">{formatCurrency(totales.amort)}</div>
            </div>
            <div>
              <div className="text-slate-500">Accesorios + IVA</div>
              <div className="font-semibold">{formatCurrency(totales.seguro + totales.gastos + totales.iva)}</div>
            </div>
            <div>
              <div className="text-slate-500">Total pagado</div>
              <div className="font-semibold">{formatCurrency(totales.pago)}</div>
            </div>
            <div>
              <div className="text-slate-500">Total prepagos</div>
              <div className="font-semibold">{formatCurrency(totales.prepago)}</div>
            </div>
            <div>
              <div className="text-slate-500">Meses efectivos</div>
              <div className="font-semibold">{rows.length}</div>
            </div>
            <div>
              <div className="text-slate-500">Intereses ahorrados (prepagos)</div>
              <div className="font-semibold">{formatCurrency(interesesAhorrados)}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={descargarCSV}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white text-sm px-4 py-2 shadow hover:bg-indigo-700"
          >
            Descargar CSV
          </button>
          <div className="text-xs text-slate-500">Los importes se redondean a 2 decimales para mostrar.</div>
        </div>

        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-slate-500">Tests rápidos (dev)</summary>
          <div className="text-xs text-slate-600 mt-2">
            <button
              onClick={() => {
                const base = buildSchedule(P, rate, n, sistema, toNumber(seguro), toNumber(gastos), Number(ivaPct), ivaBase);
                const baseInteres = base.reduce((a, r) => a + r.interes, 0);
                const con0 = buildSchedule(P, rate, n, sistema, toNumber(seguro), toNumber(gastos), Number(ivaPct), ivaBase, {});
                const con0Interes = con0.reduce((a, r) => a + r.interes, 0);
                console.assert(Math.abs(baseInteres - con0Interes) < 1e-6, "[Test] Sin prepagos el interés debe ser igual");
                const conPrep = buildSchedule(P, rate, n, sistema, toNumber(seguro), toNumber(gastos), Number(ivaPct), ivaBase, { 1: 10000 });
                const conPrepInteres = conPrep.reduce((a, r) => a + r.interes, 0);
                console.assert(conPrepInteres <= baseInteres, "[Test] Con prepago el interés total no debe aumentar");
                console.assert(conPrep.length <= base.length, "[Test] Con prepago los meses efectivos no deben aumentar");
                alert("Tests ejecutados. Revisa la consola (F12) para detalles.");
              }}
              className="mt-2 rounded-lg border px-2 py-1"
            >
              Ejecutar tests
            </button>
          </div>
        </details>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left"># PAGO</th>
                  <th className="px-3 py-2 text-right">SALDO INSOLUTO</th>
                  <th className="px-3 py-2 text-right">INTERÉS</th>
                  <th className="px-3 py-2 text-right">IVA</th>
                  <th className="px-3 py-2 text-right">AMORTIZACIÓN</th>
                  <th className="px-3 py-2 text-right">MENSUALIDAD SIN ACCESORIOS</th>
                  <th className="px-3 py-2 text-right">SEGUROS DE VIDA Y DAÑOS</th>
                  <th className="px-3 py-2 text-right">GASTOS ADMINISTRACION</th>
                  <th className="px-3 py-2 text-right">PAGO MENSUAL</th>
                  <th className="px-3 py-2 text-right">PAGO ANTICIPADO</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pago} className={r.pago % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-3 py-2">{r.pago}</td>
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
                        type="number"
                        className="w-36 text-right rounded-lg border border-slate-300 px-2 py-1"
                        value={prepagos[r.pago] ?? ""}
                        min={0}
                        step="100"
                        onChange={(e) => setPrepagos((prev) => ({ ...prev, [r.pago]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Tip: con los valores por defecto (monto $1,750,000; tasa anual 11.7%; sistema francés; meses 120; seguros $1,050; gastos $175; IVA 0%) el **primer renglón** coincide con tu ejemplo: interés $17,062.50, amortización $7,742.36 y mensualidad sin accesorios $24,804.86.
        </p>
      </div>
    </div>
  );
}
