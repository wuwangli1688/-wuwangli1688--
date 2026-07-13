import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';

interface DatePickerModalProps {
  visible: boolean;
  /** The currently selected start date (single day mode) or the start of the range */
  startDate: Date;
  /** In multi-day mode, the end of the range (null if single day) */
  endDate: Date | null;
  /** If true, multi-day range mode is enabled */
  multiDay: boolean;
  onConfirm: (startDate: Date, endDate: Date | null, multiDay: boolean) => void;
  onClose: () => void;
}

const MONTHS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

export default function DatePickerModal({
  visible,
  startDate,
  endDate,
  multiDay,
  onConfirm,
  onClose,
}: DatePickerModalProps) {
  const [mode, setMode] = useState(multiDay);
  const [selYear, setSelYear] = useState(startDate.getFullYear());
  const [selMonth, setSelMonth] = useState(startDate.getMonth());
  const [selDay, setSelDay] = useState(startDate.getDate());

  // End date selection (for multi-day mode)
  const [selEndYear, setSelEndYear] = useState(endDate ? endDate.getFullYear() : startDate.getFullYear());
  const [selEndMonth, setSelEndMonth] = useState(endDate ? endDate.getMonth() : startDate.getMonth());
  const [selEndDay, setSelEndDay] = useState(endDate ? endDate.getDate() : startDate.getDate());

  // Which side is being edited in multi-day mode
  const [editingSide, setEditingSide] = useState<'start' | 'end'>('start');

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

  const handleConfirm = () => {
    const newStart = new Date(selYear, selMonth, selDay);
    if (mode) {
      const newEnd = new Date(selEndYear, selEndMonth, selEndDay);
      // Ensure start <= end
      const finalStart = newStart <= newEnd ? newStart : newEnd;
      const finalEnd = newStart <= newEnd ? newEnd : newStart;
      onConfirm(finalStart, finalEnd, true);
    } else {
      onConfirm(newStart, null, false);
    }
  };

  const isToday = (y: number, m: number, d: number) => {
    const t = new Date();
    return y === t.getFullYear() && m === t.getMonth() && d === t.getDate();
  };

  const renderYearRow = (year: number, onChange: (y: number) => void) => (
    <View style={s.yearRow}>
      <TouchableOpacity onPress={() => onChange(year - 1)} style={s.arrowBtn}>
        <FontAwesome6 name="chevron-left" size={16} color="#4F46E5" />
      </TouchableOpacity>
      <Text style={s.yearText}>{year}年</Text>
      <TouchableOpacity onPress={() => onChange(year + 1)} style={s.arrowBtn}>
        <FontAwesome6 name="chevron-right" size={16} color="#4F46E5" />
      </TouchableOpacity>
    </View>
  );

  const renderMonthRow = (month: number, onChange: (m: number) => void) => (
    <View style={s.monthRow}>
      {MONTHS.map((label, idx) => (
        <TouchableOpacity
          key={idx}
          onPress={() => onChange(idx)}
          style={[
            s.monthBtn,
            month === idx && s.monthBtnActive,
          ]}
        >
          <Text style={[s.monthText, month === idx && s.monthTextActive]}>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderDayGrid = (year: number, month: number, day: number, onChange: (d: number) => void) => {
    const total = daysInMonth(year, month);
    const days = [];
    for (let i = 1; i <= total; i++) {
      days.push(
        <TouchableOpacity
          key={i}
          onPress={() => onChange(i)}
          style={[
            s.dayBtn,
            day === i && s.dayBtnActive,
            isToday(year, month, i) && !(day === i) && s.dayBtnToday,
          ]}
        >
          <Text style={[s.dayText, day === i && s.dayTextActive]}>
            {i}
          </Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={s.dayGrid}>
        {days}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.cancelBtn}>取消</Text>
            </TouchableOpacity>
            <Text style={s.title}>选择日期</Text>
            <TouchableOpacity onPress={handleConfirm}>
              <Text style={s.confirmBtn}>确定</Text>
            </TouchableOpacity>
          </View>

          {/* Multi-day Toggle */}
          <View style={s.toggleRow}>
            <TouchableOpacity
              onPress={() => setMode(false)}
              style={[s.toggleBtn, !mode && s.toggleBtnActive]}
            >
              <Text style={[s.toggleText, !mode && s.toggleTextActive]}>单日</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode(true)}
              style={[s.toggleBtn, mode && s.toggleBtnActive]}
            >
              <Text style={[s.toggleText, mode && s.toggleTextActive]}>多日</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
            {mode ? (
              <>
                {/* Multi-day mode: Start Date */}
                <TouchableOpacity onPress={() => setEditingSide('start')}>
                  <View style={[s.section, editingSide === 'start' && s.sectionActive]}>
                    <Text style={s.sectionLabel}>起始日期</Text>
                    {renderYearRow(editingSide === 'start' ? selYear : selEndYear, (y) => {
                      if (editingSide === 'start') setSelYear(y);
                      else setSelEndYear(y);
                    })}
                    {renderMonthRow(editingSide === 'start' ? selMonth : selEndMonth, (m) => {
                      if (editingSide === 'start') setSelMonth(m);
                      else setSelEndMonth(m);
                    })}
                    {renderDayGrid(
                      editingSide === 'start' ? selYear : selEndYear,
                      editingSide === 'start' ? selMonth : selEndMonth,
                      editingSide === 'start' ? selDay : selEndDay,
                      (d) => {
                        if (editingSide === 'start') setSelDay(d);
                        else setSelEndDay(d);
                      }
                    )}
                  </View>
                </TouchableOpacity>

                {/* Multi-day mode: End Date */}
                <TouchableOpacity onPress={() => setEditingSide('end')}>
                  <View style={[s.section, editingSide === 'end' && s.sectionActive]}>
                    <Text style={s.sectionLabel}>结束日期</Text>
                    {renderYearRow(editingSide === 'end' ? selYear : selEndYear, (y) => {
                      if (editingSide === 'end') setSelYear(y);
                      else setSelEndYear(y);
                    })}
                    {renderMonthRow(editingSide === 'end' ? selMonth : selEndMonth, (m) => {
                      if (editingSide === 'end') setSelMonth(m);
                      else setSelEndMonth(m);
                    })}
                    {renderDayGrid(
                      editingSide === 'end' ? selYear : selEndYear,
                      editingSide === 'end' ? selMonth : selEndMonth,
                      editingSide === 'end' ? selDay : selEndDay,
                      (d) => {
                        if (editingSide === 'end') setSelDay(d);
                        else setSelEndDay(d);
                      }
                    )}
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              /* Single day mode */
              <View style={s.section}>
                <Text style={s.sectionLabel}>选择日期</Text>
                {renderYearRow(selYear, setSelYear)}
                {renderMonthRow(selMonth, setSelMonth)}
                {renderDayGrid(selYear, selMonth, selDay, setSelDay)}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  cancelBtn: {
    fontSize: 16,
    color: '#8B7E6E',
  },
  confirmBtn: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  toggleBtn: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  toggleBtnActive: {
    backgroundColor: '#FF6B35',
  },
  toggleText: {
    fontSize: 14,
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sectionActive: {
    borderColor: '#FF6B35',
    backgroundColor: '#FFF8F5',
  },
  sectionLabel: {
    fontSize: 13,
    color: '#8B7E6E',
    marginBottom: 8,
    textAlign: 'center',
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  arrowBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  yearText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    minWidth: 80,
    textAlign: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  monthBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  monthBtnActive: {
    backgroundColor: '#FF6B35',
  },
  monthText: {
    fontSize: 13,
    color: '#666',
  },
  monthTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 4,
  },
  dayBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  dayBtnActive: {
    backgroundColor: '#FF6B35',
  },
  dayBtnToday: {
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  dayText: {
    fontSize: 14,
    color: '#333',
  },
  dayTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});