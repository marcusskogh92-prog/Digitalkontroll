
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import BaseControlForm from '../components/BaseControlForm';
// Skyddsrond checklist config: sections with control points
const SKYDDSROND_CHECKLIST = [
  {
    label: 'Allmän ordning och reda',
    points: [
      'Är gångvägar och arbetsytor fria från hinder?',
      'Är material och verktyg rätt placerade?',
      'Är städning tillfredsställande?'
    ]
  },
  {
    label: 'Fallrisker och ställningar',
    points: [
      'Finns skyddsräcken där det behövs?',
      'Är ställningar och stegar i gott skick?',
      'Är öppningar och hål skyddade?'
    ]
  },
  {
    label: 'Personlig skyddsutrustning',
    points: [
      'Används hjälm, skyddsskor och väst?',
      'Finns behov av hörselskydd, ögonskydd eller handskar?'
    ]
  },
  {
    label: 'Maskiner och verktyg',
    points: [
      'Är maskiner och verktyg hela och rätt använda?',
      'Finns skydd på maskiner där det krävs?'
    ]
  },
  {
    label: 'El och belysning',
    points: [
      'Är provisorisk el korrekt dragen?',
      'Är kablar hela och rätt placerade?',
      'Är arbetsbelysning tillräcklig?'
    ]
  },
  {
    label: 'Kemi och farliga ämnen',
    points: [
      'Förvaras kemikalier och farliga ämnen säkert?',
      'Är märkning och skyddsutrustning på plats?'
    ]
  },
  {
    label: 'Brandskydd',
    points: [
      'Finns brandsläckare och brandfilt?',
      'Är utrymningsvägar fria?',
      'Brandfarliga arbeten hanteras korrekt?'
    ]
  },
  {
    label: 'Lyft och transporter',
    points: [
      'Används rätt lyftanordningar?',
      'Är kranar och truckar besiktigade?'
    ]
  },
  {
    label: 'Arbete på höjd',
    points: [
      'Används fallskydd där det behövs?',
      'Är liftar och ställningar säkra?'
    ]
  },
  {
    label: 'Arbetsmiljö och trivsel',
    points: [
      'Finns tillgång till toalett och pausutrymme?',
      'Är buller och vibrationer hanterade?'
    ]
  },
  {
    label: 'Första hjälpen och olycksberedskap',
    points: [
      'Finns förbandslåda och rutiner?',
      'Är kontaktuppgifter synliga?'
    ]
  },
  {
    label: 'Skyltning och avspärrningar',
    points: [
      'Finns nödvändiga varningsskyltar?',
      'Är riskområden avspärrade?'
    ]
  },
  {
    label: 'Miljö',
    points: [
      'Hanteras avfall och spill korrekt?',
      'Förebyggs utsläpp?'
    ]
  }
];


function getWeekAndYear(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  // Calculate full weeks to nearest Thursday
  const weekNo = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { week: weekNo, year: d.getFullYear() };
}



export default function SkyddsrondScreen({ date, participants = [] }) {
  const route = useRoute();
  const project = route.params?.project;
  const { week, year } = getWeekAndYear(date);
  const LABELS = {
    title: `Skyddsrond ${year} V.${week < 10 ? '0' + week : week}`,
    saveButton: 'Spara',
    saveDraftButton: 'Spara och slutför senare',
  };

  const handleSave = async (data) => {
    try {
      const completed = {
        ...data,
        status: 'UTFÖRD',
        savedAt: new Date().toISOString(),
      };
      const existing = await AsyncStorage.getItem('completed_controls');
      let arr = [];
      if (existing) arr = JSON.parse(existing);
      arr.push(completed);
      await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
      const draft = await AsyncStorage.getItem('draft_control');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.project?.id === project?.id) {
          await AsyncStorage.removeItem('draft_control');
        }
      }
      alert('Kontrollen har sparats som utförd!');
    } catch (e) {
      alert('Kunde inte spara kontrollen: ' + e.message);
    }
  };

  return (
    <BaseControlForm
      date={date}
      controlType="Skyddsrond"
      labels={LABELS}
      participants={participants}
      project={project}
      onSave={handleSave}
      hideWeather
      checklistConfig={SKYDDSROND_CHECKLIST}
    />
  );
}
