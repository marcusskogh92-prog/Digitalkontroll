/**
 * PersonSelector - Component for selecting users or contacts
 * Allows choosing between company users/admins or contacts from contact registry
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fetchCompanyContacts, fetchCompanyMembers } from '../../../../../components/firebase';

export default function PersonSelector({
  visible,
  onClose,
  onSelect,
  companyId,
  value = null, // { type: 'user'|'contact', id: string, name: string, email?: string, phone?: string }
  placeholder = 'Välj person...',
  label = 'Person'
}) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'contacts'

  useEffect(() => {
    if (!visible || !companyId) return;
    loadData();
  }, [visible, companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load users
      const members = await fetchCompanyMembers(companyId);
      const userList = Array.isArray(members) ? members.map(m => ({
        type: 'user',
        id: m.uid || m.id,
        name: m.displayName || m.name || m.email || 'Okänd användare',
        email: m.email || null,
        phone: m.phone || null,
        role: m.role || null
      })) : [];
      setUsers(userList);

      // Load contacts
      const contactList = await fetchCompanyContacts(companyId);
      const formattedContacts = Array.isArray(contactList) ? contactList.map(c => ({
        type: 'contact',
        id: c.id,
        name: c.name || 'Okänd kontakt',
        email: c.email || null,
        phone: c.phone || null,
        role: c.role || null,
        companyName: c.contactCompanyName || c.companyName || null
      })) : [];
      setContacts(formattedContacts);
    } catch (error) {
      console.error('[PersonSelector] Error loading data:', error);
      setUsers([]);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || 
           (u.email && u.email.toLowerCase().includes(q)) ||
           (u.phone && u.phone.toLowerCase().includes(q));
  });

  const filteredContacts = contacts.filter(c => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || 
           (c.email && c.email.toLowerCase().includes(q)) ||
           (c.phone && c.phone.toLowerCase().includes(q)) ||
           (c.companyName && c.companyName.toLowerCase().includes(q));
  });

  const handleSelect = (person) => {
    if (onSelect) {
      onSelect(person);
    }
    onClose();
  };

  const handleClear = () => {
    if (onSelect) {
      onSelect(null);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{label}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Sök efter namn, e-post eller telefon..."
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'users' && styles.tabActive]}
              onPress={() => setActiveTab('users')}
            >
              <Ionicons 
                name="people-outline" 
                size={18} 
                color={activeTab === 'users' ? '#1976D2' : '#666'} 
              />
              <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
                Användare ({filteredUsers.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'contacts' && styles.tabActive]}
              onPress={() => setActiveTab('contacts')}
            >
              <Ionicons 
                name="person-outline" 
                size={18} 
                color={activeTab === 'contacts' ? '#1976D2' : '#666'} 
              />
              <Text style={[styles.tabText, activeTab === 'contacts' && styles.tabTextActive]}>
                Kontakter ({filteredContacts.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView style={styles.list}>
            {loading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Laddar...</Text>
              </View>
            ) : activeTab === 'users' ? (
              filteredUsers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Inga användare hittades</Text>
                </View>
              ) : (
                filteredUsers.map((user) => (
                  <TouchableOpacity
                    key={`user-${user.id}`}
                    style={[
                      styles.item,
                      value && value.id === user.id && value.type === 'user' && styles.itemSelected
                    ]}
                    onPress={() => handleSelect(user)}
                  >
                    <View style={styles.itemContent}>
                      <View style={styles.itemHeader}>
                        <Ionicons name="person-circle-outline" size={24} color="#1976D2" />
                        <View style={styles.itemTextContainer}>
                          <Text style={styles.itemName}>{user.name}</Text>
                          {user.role && (
                            <Text style={styles.itemRole}>{user.role}</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.itemDetails}>
                        {user.email && (
                          <View style={styles.itemDetailRow}>
                            <Ionicons name="mail-outline" size={14} color="#999" />
                            <Text style={styles.itemDetailText}>{user.email}</Text>
                          </View>
                        )}
                        {user.phone && (
                          <View style={styles.itemDetailRow}>
                            <Ionicons name="call-outline" size={14} color="#999" />
                            <Text style={styles.itemDetailText}>{user.phone}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )
            ) : (
              filteredContacts.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Inga kontakter hittades</Text>
                </View>
              ) : (
                filteredContacts.map((contact) => (
                  <TouchableOpacity
                    key={`contact-${contact.id}`}
                    style={[
                      styles.item,
                      value && value.id === contact.id && value.type === 'contact' && styles.itemSelected
                    ]}
                    onPress={() => handleSelect(contact)}
                  >
                    <View style={styles.itemContent}>
                      <View style={styles.itemHeader}>
                        <Ionicons name="person-outline" size={24} color="#FF9800" />
                        <View style={styles.itemTextContainer}>
                          <Text style={styles.itemName}>{contact.name}</Text>
                          {contact.companyName && (
                            <Text style={styles.itemRole}>{contact.companyName}</Text>
                          )}
                          {contact.role && (
                            <Text style={styles.itemRole}>{contact.role}</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.itemDetails}>
                        {contact.email && (
                          <View style={styles.itemDetailRow}>
                            <Ionicons name="mail-outline" size={14} color="#999" />
                            <Text style={styles.itemDetailText}>{contact.email}</Text>
                          </View>
                        )}
                        {contact.phone && (
                          <View style={styles.itemDetailRow}>
                            <Ionicons name="call-outline" size={14} color="#999" />
                            <Text style={styles.itemDetailText}>{contact.phone}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {value && (
              <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                <Ionicons name="close-circle" size={20} color="#D32F2F" />
                <Text style={styles.clearButtonText}>Rensa val</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    ...(Platform.OS === 'web' ? { maxHeight: '600px' } : {}),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#222',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#1976D2',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#1976D2',
    fontWeight: '600',
  },
  list: {
    flex: 1,
    maxHeight: 400,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemSelected: {
    backgroundColor: '#E3F2FD',
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  itemRole: {
    fontSize: 13,
    color: '#666',
  },
  itemDetails: {
    marginLeft: 36,
    gap: 4,
  },
  itemDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemDetailText: {
    fontSize: 13,
    color: '#666',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#D32F2F',
    fontWeight: '600',
  },
});
