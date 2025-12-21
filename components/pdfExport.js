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

// Build HTML for Mottagningskontroll (report-style layout matching mock)
export function buildMottagningsPdfHtml({ control, project, company }) {
  const title = 'Mottagningskontroll';
  const date = control?.date || control?.savedAt || '';
  const companyName = company?.name || 'FÖRETAG AB';
  const companyLogoUrl = company?.logoUrl || '';
  const companyLogoBase64 = company?.logoBase64 || null;

  const projectLine = `${project?.id ? project.id + ' - ' : ''}${project?.name || ''}`;
  const participants = Array.isArray(control?.localParticipants) ? control.localParticipants : (Array.isArray(control?.participants) ? control.participants : []);
  const weather = control?.selectedWeather || control?.weather || '';
  const materialDesc = control?.materialDesc || control?.material || '';
  const photos = Array.isArray(control?.mottagningsPhotos) ? control.mottagningsPhotos : (Array.isArray(control?.photos) ? control.photos : []);
  const signatures = Array.isArray(control?.mottagningsSignatures) ? control.mottagningsSignatures : [];
  const checklist = Array.isArray(control?.checklist) ? control.checklist : (Array.isArray(control?.points) ? control.points : []);

  // Logo selection: prefer provided base64, then URL/path, then bundled asset
  const logoSrcFallback = 'assets/images/foretag_ab.png';
  const logoImgTagHeader = companyLogoBase64
    ? `<img src="data:image/png;base64,${companyLogoBase64}" style="height:48px; display:block;"/>`
    : (companyLogoUrl ? `<img src="${companyLogoUrl}" style="height:48px; display:block;"/>` : `<img src="${logoSrcFallback}" style="height:48px; display:block;"/>`);
  const logoImgTagSmall = companyLogoBase64
    ? `<img src="data:image/png;base64,${companyLogoBase64}" style="height:24px; display:block;"/>`
    : (companyLogoUrl ? `<img src="${companyLogoUrl}" style="height:24px; display:block;"/>` : `<img src="${logoSrcFallback}" style="height:24px; display:block;"/>`);

  const headerHtml = `
    <div style="width:100%;">
      <!-- Top: company logo -->
      <div style="display:flex; align-items:center; justify-content:flex-start;">
        <div style="width:160px;">${logoImgTagHeader}</div>
      </div>

      <!-- Horizontal marking under logo (thin black line) -->
      <div style="height:8px"></div>
      <div style="width:100%; height:2px; background:#000; margin:6px 0 10px 0;"></div>

      <!-- Title with vector icon below marking -->
      <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
        <div style="width:44px; height:44px; border-radius:8px; background:transparent; display:flex; align-items:center; justify-content:center;">
          <svg width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="#7B1FA2" stroke-width="2"/>
            <path d="M7 12l3 3 7-7" fill="none" stroke="#7B1FA2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div style="font-size:28px; font-weight:800; color:#222;">${title}</div>
      </div>
    </div>
  `;

    const metaHtml = `
      <div style="background:#f1f1f1; border-radius:8px; padding:12px; margin-top:8px; border:1px solid #e6e6e6;">
        <div style="font-weight:800; padding:6px 8px; background:rgba(0,0,0,0.03); border-radius:6px;">PROJEKT ${escapeHtml(projectLine)}</div>
        <table style="width:100%; margin-top:10px; border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top; padding:8px; width:160px; font-weight:700; color:#333;">Datum för kontroll:</td>
            <td style="padding:8px; color:#333;">${escapeHtml(date || '')}</td>
          </tr>
          <tr>
            <td style="vertical-align:top; padding:8px; font-weight:700; color:#333;">Deltagare:</td>
            <td style="padding:8px; color:#333;">${participants.length ? participants.map(p => `<div style="margin-bottom:6px; display:flex; align-items:center; gap:8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#666"/></svg><span>${escapeHtml(typeof p === 'string' ? p : (p.name || p.company || ''))}</span></div>`).join('') : '<i>Inga deltagare</i>'}</td>
          </tr>
          <tr>
            <td style="vertical-align:top; padding:8px; font-weight:700; color:#333;">Väder:</td>
            <td style="padding:8px; color:#333;">${escapeHtml(weather || '—')}</td>
          </tr>
        </table>
      </div>
    `;

  // Summary of deviations (prominent box) — helpful to quickly see issues
  let deviationSummaryHtml = '';
  try {
    let totalDeviations = 0;
    const sectionSummaries = [];
    if (Array.isArray(checklist) && checklist.length > 0) {
      checklist.forEach((section) => {
        const statuses = Array.isArray(section.statuses) ? section.statuses : [];
        const count = statuses.filter(s => String(s || '').toLowerCase() === 'avvikelse').length;
        if (count > 0) {
          totalDeviations += count;
          const label = section.label || section.title || '';
          sectionSummaries.push(`<div style="margin-bottom:6px;"><strong>${escapeHtml(label || 'Sektion')}</strong>: ${count} avvikelse${count>1 ? 'r' : ''}</div>`);
        }
      });
    }
    if (totalDeviations > 0) {
      deviationSummaryHtml = `
        <div style="margin-top:12px; padding:12px; border-radius:8px; border:2px solid #FFD600; background:#FFF8E1;">
          <div style="font-weight:800; color:#B85C00; font-size:16px; margin-bottom:8px;">Sammanställning — Avvikelser: ${totalDeviations}</div>
          <div style="font-size:13px; color:#333;">${sectionSummaries.join('')}</div>
        </div>
      `;
    }
  } catch (e) {
    deviationSummaryHtml = '';
  }

  // Checklist rendering (modern cards)
  let checklistHtml = '';
  if (Array.isArray(checklist) && checklist.length > 0) {
    checklistHtml = checklist.map(section => {
      const secLabel = escapeHtml(section.label || section.title || '');
      const items = Array.isArray(section.points || section.items) ? (section.points || section.items) : [];
      const statuses = Array.isArray(section.statuses) ? section.statuses : [];
      const list = items.map((it, idx) => {
          const status = statuses && statuses[idx] ? String(statuses[idx]).toLowerCase() : '';
          let checkSvg = `<div style="width:20px; height:20px; border:1px solid #ccc; border-radius:4px;"></div>`;
          if (status === 'ok' || status === 'true') {
            checkSvg = `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#2e7d32"/><path d="M7 12l3 3 7-7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          } else if (status === 'avvikelse' || status === 'avvikelse' ) {
            checkSvg = `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polygon points="12,2 22,20 2,20" fill="#FFD600" stroke="#111" stroke-width="1"/><text x="12" y="15" font-size="12" font-weight="700" fill="#111" text-anchor="middle">!</text></svg>`;
          } else if (status === 'ejaktuell' || status === 'ej aktuell' || status === 'notapplicable' || status === 'na') {
            checkSvg = `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#ffffff" stroke="#bbb" stroke-width="1"/><path d="M8 8 L16 16 M16 8 L8 16" stroke="#444" stroke-width="1.8" stroke-linecap="round"/></svg>`;
          }
          return `<div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;"><div style="width:28px; text-align:center;">${checkSvg}</div><div style="flex:1; font-size:14px;">${escapeHtml(it)}</div></div>`;
        }).join('');
      return `<div style="border:1px solid #e6e9eb; border-radius:8px; padding:12px; margin-bottom:12px; background:#fff">` + (secLabel ? `<div style="font-weight:700; margin-bottom:8px;">${secLabel}</div>` : '') + list + `</div>`;
    }).join('');
  } else {
    checklistHtml = '<div>Inga kontrollpunkter sparade.</div>';
  }

  // Photos grid + caption
  let photosHtml = '';
  const photoCaption = escapeHtml(control?.photoCaption || control?.photoNote || materialDesc || 'Material leverans inspekterad och dokumenterad');
  if (Array.isArray(photos) && photos.length > 0) {
    const cells = photos.map(ph => {
      const src = ph && ph.uri ? ph.uri : ph || '';
      return `<div style="width:33%; padding:8px; box-sizing:border-box;">
                <div style="width:100%; height:120px; border-radius:6px; border:1px solid #eee; background:#fafafa; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                  ${src ? `<img src="${src}" style="width:100%; height:100%; object-fit:cover; display:block;"/>` : `<div style="color:#bbb; font-size:12px;">Ingen bild</div>`}
                </div>
              </div>`;
    }).join('');
    photosHtml = `<div style="display:flex; flex-wrap:wrap; margin-top:8px;">${cells}</div>`;
    photosHtml += `<div style="text-align:center; color:#555; font-size:12px; margin-top:8px; font-style:italic;">${photoCaption}</div>`;
  } else photosHtml = '<div>Inga bifogade bilder.</div>';

  // Signatures
  const signaturesHtml = (Array.isArray(signatures) && signatures.length > 0) ? signatures.map(s => `
    <div style="display:inline-block; width:33%; vertical-align:top; text-align:center; padding:8px;">
      <div style="height:64px; display:flex; align-items:center; justify-content:center;">
        ${s.uri ? `<img src="${s.uri}" style="max-height:64px; display:block; margin:0 auto;"/>` : (s.strokes ? '<div style="height:64px;"></div>' : '')}
      </div>
      <div style="height:1px; border-bottom:1px dashed #ddd; margin:10px 20px 6px 20px;"></div>
      <div style="margin-top:6px; font-weight:700; color:#333; font-size:13px;">${escapeHtml(s.name || '')}</div>
    </div>
  `).join('') : '<div>Inga signaturer</div>';

  const footerHtml = `
    <div style="width:100%; margin-top:28px; padding-top:12px; border-top:1px solid #eee; display:flex; align-items:center; justify-content:space-between;">
      <div style="color:#444; font-size:13px;">Kontrollen är utförd med <strong>DigitalKontroll</strong></div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="height:28px;">${logoImgTagSmall}</div>
        <div style="color:#777; font-size:12px;">www.digitalkontroll.se | info@digitalkontroll.se | 08-123 456 78</div>
      </div>
    </div>
  `;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#222; padding:16px; }
          h2 { margin:10px 0; color:#263238; }
          .card { background:#fff; border:1px solid #eef2f4; border-radius:10px; padding:12px; }
        </style>
      </head>
      <body>
        ${headerHtml}
        ${metaHtml}
        ${deviationSummaryHtml}

        <h2>Kontrollpunkter</h2>
        ${checklistHtml}

        <h2>Bifogade bilder</h2>
        ${photosHtml}

        <h2>Signaturer</h2>
        <div style="display:flex; gap:8px; margin-top:8px;">${signaturesHtml}</div>

        ${footerHtml}
      </body>
    </html>
  `;
}

// Dispatcher: choose builder based on control type
export function buildPdfHtmlForControl({ control, project, company }) {
  if (!control || !control.type) return buildControlPdfHtml({ control, project, company });
  switch ((control.type || '').toString()) {
    case 'Mottagningskontroll':
      return buildMottagningsPdfHtml({ control, project, company });
    default:
      return buildControlPdfHtml({ control, project, company });
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
