// Minimal PDF export scaffold for controls with a shared header
// Uses "Mätplats" terminology per request

export function buildControlPdfHtml({ control, project, company }) {
  const title = control?.type || 'Kontroll';
  const date = control?.date || '';
  const companyName = company?.name || 'FÖRETAG AB';
  const companyLogoUrl = company?.logoUrl || '';

  // Fält för Fuktmätning
  const device = control?.device || '';
  const serial = control?.serial || '';
  const calibrationDate = control?.calibrationDate || '';
  const location = control?.location || '';
  const material = control?.material || '';
  const method = control?.method || '';
  const reference = control?.reference || '';
  const measurements = Array.isArray(control?.measurements) ? control.measurements : [];

  const logoSrc = companyLogoUrl || 'assets/images/foretag_ab.png';
  const headerHtml = `
    <table style="width:100%; border-collapse:collapse;">
      <tr>
        <td style="vertical-align:middle; width:40%;">
          ${logoSrc ? `<img src="${logoSrc}" style="height:48px; display:block;"/>` : ''}
          <div style="font-weight:700; color:#263238; margin-top:6px;">${companyName}</div>
        </td>
        <td style="text-align:right; vertical-align:middle; width:60%;">
          <div style="font-size:22px; font-weight:800; color:#263238;">${title}</div>
          <div style="color:#666; margin-top:4px;">Datum: ${date}</div>
          <div style="color:#666;">Projekt: ${project?.id || ''} - ${project?.name || ''}</div>
        </td>
      </tr>
    </table>
    <div style="height:8px"></div>
    <div style="width:100%; height:2px; background:#000; margin:6px 0 16px 0;"></div>
  `;

  const fuktMetaHtml = `
    <h3 style="color:#263238;">Mätinstrument</h3>
    <div>Instrument: ${escapeHtml(device)} | Serienummer: ${escapeHtml(serial)} | Kalibrering: ${escapeHtml(calibrationDate)}</div>
    <h3 style="color:#263238; margin-top:12px;">Mätplats</h3>
    <div>Plats/rum: ${escapeHtml(location)} | Material: ${escapeHtml(material)}</div>
    <div>Metod: ${escapeHtml(method)} | Referens: ${escapeHtml(reference)}</div>
  `;

  const rows = measurements.map((m, i) => `
    <tr>
      <td style="padding:6px; border:1px solid #E3E6E8;">${i + 1}</td>
      <td style="padding:6px; border:1px solid #E3E6E8;">${escapeHtml(m.position || '')}</td>
      <td style="padding:6px; border:1px solid #E3E6E8;">${escapeHtml(m.depth || '')}</td>
      <td style="padding:6px; border:1px solid #E3E6E8;">${escapeHtml(m.temp || '')}</td>
      <td style="padding:6px; border:1px solid #E3E6E8;">${escapeHtml(m.value || '')} ${escapeHtml(m.unit || '')}</td>
      <td style="padding:6px; border:1px solid #E3E6E8;">${escapeHtml(m.note || '')}</td>
    </tr>
  `).join('');

  const tableHtml = `
    <h3 style="color:#263238; margin-top:16px;">Mätpunkter</h3>
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#F7FAFC;">
          <th style="padding:6px; border:1px solid #E3E6E8;">#</th>
          <th style="padding:6px; border:1px solid #E3E6E8;">Position</th>
          <th style="padding:6px; border:1px solid #E3E6E8;">Djup (mm)</th>
          <th style="padding:6px; border:1px solid #E3E6E8;">Temp (°C)</th>
          <th style="padding:6px; border:1px solid #E3E6E8;">Värde</th>
          <th style="padding:6px; border:1px solid #E3E6E8;">Anteckning</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; color:#222; }
          h3 { margin: 8px 0; }
        </style>
      </head>
      <body>
        ${headerHtml}
        ${fuktMetaHtml}
        ${tableHtml}
      </body>
    </html>
  `;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
