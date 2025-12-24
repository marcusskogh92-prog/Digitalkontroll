// scripts/seed-testdata.js
// Script för att lägga in testdata i Firestore för test/demo-kontot

const { saveHierarchy } = require('../components/firebase');

const companyId = 'testdemo';

const testHierarchy = [
  {
    id: 'main1',
    name: 'Byggprojekt',
    expanded: false,
    children: [
      {
        id: 'sub1',
        name: 'Stockholm',
        expanded: false,
        children: [
          {
            id: 'P-1001',
            name: 'Projekt Slussen',
            type: 'project',
            status: 'ongoing',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'P-1002',
            name: 'Projekt Hammarby',
            type: 'project',
            status: 'completed',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      {
        id: 'sub2',
        name: 'Göteborg',
        expanded: false,
        children: [
          {
            id: 'P-2001',
            name: 'Projekt Gamlestaden',
            type: 'project',
            status: 'ongoing',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'P-2002',
            name: 'Projekt Mölndal',
            type: 'project',
            status: 'ongoing',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
  },
  {
    id: 'main2',
    name: 'Serviceprojekt',
    expanded: false,
    children: [
      {
        id: 'sub3',
        name: 'Malmö',
        expanded: false,
        children: [
          {
            id: 'P-3001',
            name: 'Projekt Limhamn',
            type: 'project',
            status: 'completed',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'P-3002',
            name: 'Projekt Hyllie',
            type: 'project',
            status: 'ongoing',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      {
        id: 'sub4',
        name: 'Uppsala',
        expanded: false,
        children: [
          {
            id: 'P-4001',
            name: 'Projekt Gränby',
            type: 'project',
            status: 'ongoing',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'P-4002',
            name: 'Projekt Fyrislund',
            type: 'project',
            status: 'completed',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
  },
];

async function main() {
  console.log('Sparar testdata till Firestore...');
  await saveHierarchy(companyId, testHierarchy);
  console.log('Klart!');
}

main().catch(console.error);
