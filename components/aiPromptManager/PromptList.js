/**
 * Promptlista: statistik + kortlista med kebab-meny.
 */

import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import ContextMenu from '../ContextMenu';
import PromptCard from './PromptCard';

function formatDate(d) {
  if (!d) return '–';
  if (typeof d.toLocaleDateString === 'function') {
    return d.toLocaleDateString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return String(d);
}

export default function PromptList({
  templates,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
}) {
  const [kebabTemplate, setKebabTemplate] = useState(null);
  const [kebabPosition, setKebabPosition] = useState({ x: 0, y: 0 });

  const activeCount = templates.filter((t) => t.active !== false).length;
  const defaultTemplate = templates.find((t) => t.isDefault === true);
  const lastUsed = templates
    .filter((t) => t.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt?.getTime?.() ?? 0) - (a.lastUsedAt?.getTime?.() ?? 0))[0];

  const handleOpenKebab = (template, x, y) => {
    setKebabTemplate(template);
    setKebabPosition({ x, y });
  };

  const handleKebabSelect = (key) => {
    if (!kebabTemplate) return;
    if (key === 'edit') onEdit(kebabTemplate);
    if (key === 'duplicate') onDuplicate(kebabTemplate);
    if (key === 'delete') onDelete(kebabTemplate);
    setKebabTemplate(null);
  };

  return (
    <>
      <View
        style={{
          padding: 14,
          backgroundColor: '#f8fafc',
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 }}>Promptstatistik</Text>
        <Text style={{ fontSize: 13, color: '#64748b' }}>Antal aktiva prompter: {activeCount}</Text>
        <Text style={{ fontSize: 13, color: '#64748b' }}>Standard: {defaultTemplate ? defaultTemplate.name : '–'}</Text>
        <Text style={{ fontSize: 13, color: '#64748b' }}>Senast använd: {formatDate(lastUsed?.lastUsedAt)}</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {templates.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#64748b' }}>Inga prompter ännu. Klicka på &quot;Ny prompt&quot; för att skapa.</Text>
          </View>
        ) : (
          templates.map((t) => (
            <PromptCard
              key={t.id}
              template={t}
              onToggleActive={onToggleActive}
              onOpenKebab={handleOpenKebab}
            />
          ))
        )}
      </ScrollView>
      <ContextMenu
        visible={Boolean(kebabTemplate)}
        x={kebabPosition.x}
        y={kebabPosition.y}
        items={[
          { key: 'edit', label: 'Redigera' },
          { key: 'duplicate', label: 'Duplicera' },
          { key: 'delete', label: 'Ta bort', danger: true },
        ]}
        onSelect={handleKebabSelect}
        onClose={() => setKebabTemplate(null)}
        align="right"
        direction="down"
      />
    </>
  );
}
