# AI-analysblock: FFU (förfrågningsunderlag)

Det här dokumentet beskriver backend/AI-logik för att analysera ett FFU baserat på **endast** uppladdade dokuments `extractedText`.

## 1) Exempel på AI-prompt

### System message

Du är en noggrann assistent som analyserar svenska förfrågningsunderlag (FFU).

Regler:
- Du får ENDAST använda texten som tillhandahålls i detta anrop.
- Du får INTE göra antaganden om AF/AB/TB, entreprenadform, juridik eller praxis om det inte uttryckligen står i texten.
- Om något inte framgår av texten: skriv tom sträng eller tom lista.
- Returnera ENDAST giltig JSON som exakt matchar det efterfrågade formatet. Ingen Markdown. Inga extra nycklar.

### User message (template)

Analysera följande FFU som ett sammanhängande underlag.

companyId: <companyId>
projectId: <projectId>

Dokument (med extraherad text):
[
  {
    "id": "file-1",
    "name": "FFU - Administrativa föreskrifter.pdf",
    "type": "pdf",
    "extractedText": "..."
  },
  {
    "id": "file-2",
    "name": "Kravspec.docx",
    "type": "docx",
    "extractedText": "..."
  }
]

Krav på output:
- summary.description: kort sammanfattning av vad upphandlingen avser.
- summary.projectType: projekt-/uppdragstyp om den står i texten, annars "".
- summary.procurementForm: entreprenad-/upphandlingsform endast om explicit angiven, annars "".
- requirements.must: endast obligatoriska SKA-krav.
- requirements.should: endast utvärderande/meriterande BÖR-krav.
- risks: endast oklarheter, saknad info eller flertydighet baserat på texten (inga gissningar).
- openQuestions: frågor som bör ställas baserat på brister/oklarheter i texten.

Returnera JSON i exakt detta format:
{
  "summary": {
    "description": "",
    "projectType": "",
    "procurementForm": ""
  },
  "requirements": {
    "must": [
      {
        "text": "",
        "source": ""
      }
    ],
    "should": [
      {
        "text": "",
        "source": ""
      }
    ]
  },
  "risks": [
    {
      "issue": "",
      "reason": ""
    }
  ],
  "openQuestions": [
    {
      "question": "",
      "reason": ""
    }
  ]
}

## 2) TypeScript (pseudokod) för analysfunktionen

```ts
type FFUFile = {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'xlsx' | 'txt';
  extractedText: string;
};

type AnalyzeFFUInput = {
  companyId: string;
  projectId: string;
  files: FFUFile[];
};

type FFUAnalysisResult = {
  summary: {
    description: string;
    projectType: string;
    procurementForm: string;
  };
  requirements: {
    must: { text: string; source: string }[];
    should: { text: string; source: string }[];
  };
  risks: { issue: string; reason: string }[];
  openQuestions: { question: string; reason: string }[];
};

async function analyzeFFU(input: AnalyzeFFUInput, authContext: { uid: string; token: any }): Promise<FFUAnalysisResult> {
  // 1) validate input
  if (!input.companyId || !input.projectId) throw new Error('companyId & projectId required');
  if (!input.files?.length) throw new Error('files required');

  const nonEmpty = input.files.filter(f => (f.extractedText || '').trim().length > 0);
  if (!nonEmpty.length) throw new Error('No extractedText in any file');

  // 2) authorize (company member OR global/superadmin)
  const isMember = authContext.token?.companyId === input.companyId;
  const isGlobal = !!authContext.token?.superadmin || authContext.token?.role === 'superadmin' || !!authContext.token?.globalAdmin;
  if (!isMember && !isGlobal) throw new Error('permission-denied');

  // 3) compute input hash (for caching)
  const inputHash = sha256(JSON.stringify(input.files.map(f => ({ id: f.id, name: f.name, type: f.type, extractedText: f.extractedText }))));

  // 4) read cache (per project)
  const cacheRef = doc(`foretag/${input.companyId}/projects/${input.projectId}/ai/ffu_analysis`);
  const cached = await getDoc(cacheRef);
  if (cached.exists && cached.data().inputHash === inputHash) return cached.data().result as FFUAnalysisResult;

  // 5) build prompt & call AI once
  const { system, user } = buildPrompt(input);
  const aiJsonText = await callLLM({ system, user, responseFormat: 'json' });

  // 6) parse + normalize output (guard against missing fields)
  const parsed = JSON.parse(aiJsonText);
  const result = normalizeToSchema(parsed);

  // 7) write cache (best-effort)
  await setDoc(cacheRef, { inputHash, result, updatedAt: serverTimestamp(), updatedBy: authContext.uid }, { merge: true });

  return result;
}
```

## 3) Förslag: cachelagring per projekt

**Rekommenderad cache:**
- Dokument: `foretag/{companyId}/projects/{projectId}/ai/ffu_analysis`
- Fält:
  - `inputHash`: SHA-256 av normaliserad input (inkl. `extractedText`)
  - `result`: själva JSON-resultatet
  - `model`: vilket modellnamn som användes
  - `totalChars`, `fileCount`
  - `updatedAt`, `updatedBy`

**Invalidation:**
- Om användaren laddar upp/ändrar dokument → `inputHash` ändras automatiskt.
- Valfritt: komplettera med manuell "Rensa analys" som bara tar bort docen.

**TTL/retention (valfritt):**
- Behåll senaste analysen (doc overwrite).
- Eller spara historik i subcollection `ai/ffu_analysis_runs/{runId}` om ni vill kunna jämföra över tid.
