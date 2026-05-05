import * as XLSX from "xlsx";
import { toast } from "sonner";

export type ExportFormat = "csv" | "excel" | "pdf";

export function downloadBlob(blob: Blob, filename: string, recordCount?: number) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    if (typeof recordCount === "number") {
        toast.success(`Descargado: ${recordCount.toLocaleString()} registros`);
    } else {
        toast.success("Descarga iniciada");
    }
}

export function exportRowsAsCSV(rows: Record<string, any>[], filename: string) {
    if (!rows.length) {
        toast.error("No hay datos para exportar");
        return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(","),
        ...rows.map((r) =>
            headers
                .map((k) => {
                    const v = r[k];
                    const s = v == null ? "" : String(v);
                    return `"${s.replace(/"/g, '""')}"`;
                })
                .join(",")
        ),
    ].join("\n");
    downloadBlob(
        new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
        filename,
        rows.length
    );
}

export function exportRowsAsExcel(rows: Record<string, any>[], filename: string, sheetName = "Reporte") {
    if (!rows.length) {
        toast.error("No hay datos para exportar");
        return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map((k) => ({
        wch: Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    toast.success(`Descargado: ${rows.length.toLocaleString()} registros`);
}

export function exportRowsAsPDF(rows: Record<string, any>[], title: string, subtitle = "") {
    if (!rows.length) {
        toast.error("No hay datos para exportar");
        return;
    }
    const headers = Object.keys(rows[0]);
    const html = `<html><head><title>${title}</title><style>
      body{font-family:Inter,system-ui,sans-serif;font-size:9px;margin:12px;color:#1e293b}
      h1{font-size:14px;margin:0 0 4px}
      .meta{color:#64748b;margin-bottom:8px;font-size:10px}
      table{width:100%;border-collapse:collapse}
      th{background:#0f172a;color:#fff;padding:5px 6px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.5px}
      td{border-bottom:1px solid #e2e8f0;padding:3px 6px;font-size:8px}
      tr:nth-child(even){background:#f8fafc}
      @media print{body{margin:0}}
    </style></head><body>
      <h1>${title}</h1>
      ${subtitle ? `<div class="meta">${subtitle}</div>` : ""}
      <table>
        <thead><tr>${headers.map((k) => `<th>${k}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${headers.map((k) => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
    }
}

export function dispatchExport(
    format: ExportFormat,
    rows: Record<string, any>[],
    baseFilename: string,
    pdfTitle: string,
    pdfSubtitle = ""
) {
    if (!rows.length) {
        toast.error("No hay datos para exportar");
        return;
    }
    if (format === "csv") {
        exportRowsAsCSV(rows, `${baseFilename}.csv`);
    } else if (format === "excel") {
        exportRowsAsExcel(rows, `${baseFilename}.xlsx`);
    } else {
        exportRowsAsPDF(rows, pdfTitle, pdfSubtitle);
    }
}
