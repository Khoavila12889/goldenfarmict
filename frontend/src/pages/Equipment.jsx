import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  getEquipmentList, createEquipment, updateEquipment,
  revokeEquipment, allocateEquipment, getEquipmentHistory,
  getEmployees,
} from '../services/api'
import { formatDate } from '../utils/formatters'
import {
  Monitor, Laptop, Printer, Monitor as MonitorIcon, Keyboard, Mouse,
  Smartphone, Tablet, Package, Plus, Search, Download, RefreshCw,
  MoreHorizontal, Eye, Pencil, Trash2, History, Undo2, UserPlus,
  X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  CheckCircle, AlertTriangle, XCircle, ArrowUpDown,
  SlidersHorizontal, Columns, Loader2, Box, Users,
  AlertOctagon, Wifi, HardDrive, Cpu,
  PanelRight, List, GripHorizontal, FileDown,
  Info, CalendarDays,
} from 'lucide-react'

const TYPE_OPTIONS = ['Laptop', 'PC', 'Máy in', 'Màn hình', 'Bàn phím', 'Chuột', 'Điện thoại', 'Tablet', 'Khác']

const TYPE_ICONS = {
  'Laptop': Laptop, 'PC': Monitor, 'Máy in': Printer,
  'Màn hình': MonitorIcon, 'Bàn phím': Keyboard, 'Chuột': Mouse,
  'Điện thoại': Smartphone, 'Tablet': Tablet, 'Khác': Package,
}

const HEALTH_MAP = {
  'Bình thường': { label: 'Bình thường', bg: '#dcfce7', color: '#16a34a', icon: CheckCircle },
  'Hơi chậm': { label: 'Hơi chậm', bg: '#fef3c7', color: '#d97706', icon: AlertTriangle },
  'Lỗi / Hỏng': { label: 'Lỗi / Hỏng', bg: '#fef2f2', color: '#dc2626', icon: XCircle },
}

const ALL_COLUMNS = [
  { key: 'asset_code', label: 'Mã TS', minWidth: 130, sortable: true },
  { key: 'equipment_type', label: 'Loại', minWidth: 100, sortable: true },
  { key: 'serial_number', label: 'S/N', minWidth: 130, sortable: true },
  { key: 'full_name', label: 'Người sử dụng', minWidth: 170, sortable: true },
  { key: 'status_label', label: 'Trạng thái', minWidth: 120, sortable: true },
  { key: 'health_label', label: 'Sức khỏe', minWidth: 110, sortable: true },
]

const STORAGE_KEYS = {
  columns: 'eq_visible_cols',
  density: 'eq_density',
}

function statusInfo(eq) {
  if (eq.employee_id) return { label: 'Đang sử dụng', bg: '#dcfce7', color: '#16a34a' }
  return { label: 'Trong kho', bg: '#e8f0fe', color: '#00468C' }
}

function categorizeSpecs(specs) {
  if (!specs) return { cpu: null, ram: null, storage: null, os: null, other: [] }
  const parts = specs.split('|').map(s => s.trim()).filter(Boolean)
  const r = { cpu: null, ram: null, storage: null, os: null, other: [] }
  for (const p of parts) {
    const l = p.toLowerCase()
    if (/(core\s*i[3579]|ryzen\s*\d|intel\s*(?!uhd|iris|hd\s)|amd\s*(?!radeon)|pentium|celleron|threadripper|xeon|athlon|epoy)/.test(l) && !/(gb|ssd|hdd|nvme|windows|linux|ddr)/.test(l)) {
      r.cpu = p
    } else if (/(\d+\s*(gb|mb|tb)\s*(ddr|ram|memory|sdram)?|ddr[345]|ram\s*\d+)/.test(l)) {
      r.ram = p
    } else if (/(ssd|hdd|nvme|\d+\s*(gb|tb)\s*(ssd|hdd|nvme|disk))/i.test(l)) {
      r.storage = p
    } else if (/(windows|linux|macos|ubuntu|chrome\s*os|microsoft)/i.test(l)) {
      r.os = p
    } else {
      r.other.push(p)
    }
  }
  return r
}

function emptyFormData() {
  return {
    asset_code: 'TS-' + String(Date.now()).slice(-5), equipment_type: '', specs: '', serial_number: '',
    status: '', description: '', notes: '', issued_date: '',
  }
}

export default function Equipment() {
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [storageTab, setStorageTab] = useState('all')
  const [typeFilter, setTypeFilter] = useState('Tất cả')
  const [healthFilter, setHealthFilter] = useState('Tất cả')
  const [msg, setMsg] = useState('')

  const [selectedEq, setSelectedEq] = useState(null)
  const [empSearch, setEmpSearch] = useState('')
  const [empResults, setEmpResults] = useState([])
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showHist, setShowHist] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyFormData())
  const [saving, setSaving] = useState(false)

  const [sortField, setSortField] = useState('asset_code')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const pageSize = 15

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [actionMenuId, setActionMenuId] = useState(null)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.columns)
      if (saved) return new Set(JSON.parse(saved))
    } catch {}
    return new Set(ALL_COLUMNS.map(c => c.key))
  })
  const [density, setDensity] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.density) || 'normal'
  })

  const columns = useMemo(() => ALL_COLUMNS.filter(c => visibleCols.has(c.key)), [visibleCols])

  const searchTimerRef = useRef(null)
  const actionRef = useRef(null)

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setActionMenuId(null)
        setColumnMenuOpen(false)
      }
    }
    function handleClick(e) {
      if (actionRef.current && !actionRef.current.contains(e.target)) {
        setActionMenuId(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.columns, JSON.stringify([...visibleCols]))
  }, [visibleCols])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.density, density)
  }, [density])

  const load = useCallback(() => {
    setLoading(true)
    getEquipmentList({ storage: storageTab, search })
      .then(r => setEquipment(r.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [storageTab, search])

  useEffect(() => { load() }, [load])

  function handleSearchInput(e) {
    const val = e.target.value
    setSearchInput(val)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(val)
      setPage(1)
    }, 300)
  }

  function clearSearch() {
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  function openCreate() {
    setEditId(null)
    setForm(emptyFormData())
    setShowForm(true)
  }

  function openEdit(eq) {
    setEditId(eq.id)
    setForm({
      asset_code: eq.asset_code || '',
      equipment_type: eq.equipment_type || '',
      specs: eq.specs || '',
      serial_number: eq.serial_number || '',
      status: eq.status || '',
      description: eq.description || '',
      notes: eq.notes || '',
      issued_date: eq.issued_date || '',
    })
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      if (editId) { await updateEquipment(editId, form) }
      else { await createEquipment({ ...form, employee_id: null }) }
      setShowForm(false)
      load()
      setMsg(editId ? 'Đã cập nhật thiết bị.' : 'Đã thêm thiết bị mới vào kho.')
      setTimeout(() => setMsg(''), 3000)
    } catch {
      setMsg('Lỗi kết nối')
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(eq) {
    if (!window.confirm(`Thu hồi thiết bị ${eq.asset_code || eq.equipment_type} về kho?`)) return
    setMsg('')
    try {
      await revokeEquipment(eq.id)
      load()
      setSelectedEq(prev => prev?.id === eq.id ? { ...prev, employee_id: null, full_name: null, department: null, emp_code: null } : prev)
      setMsg('Đã thu hồi thiết bị về kho.')
    } catch {
      setMsg('Lỗi thu hồi thiết bị.')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleAllocate(eqId, target) {
    setMsg('')
    setEmpSearch('')
    setEmpResults([])
    try {
      await allocateEquipment(eqId, {
        employee_id: target.id, employee_code: target.employee_code, employee_name: target.full_name,
      })
      load()
      const updated = equipment.find(e => e.id === eqId)
      if (updated) setSelectedEq(updated)
      setMsg(`Đã cấp phát cho ${target.full_name}.`)
    } catch {
      setMsg('Lỗi cấp phát thiết bị.')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  async function searchEmp(q) {
    setEmpSearch(q)
    if (q.trim()) {
      const r = await getEmployees(q.trim())
      setEmpResults(r.data?.data || [])
    } else {
      setEmpResults([])
    }
  }

  async function loadHistory(eqId) {
    if (showHist && history.length > 0) {
      setShowHist(false)
      return
    }
    setShowHist(true)
    setHistoryLoading(true)
    try {
      const r = await getEquipmentHistory(eqId)
      setHistory(r.data?.data || [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  function selectEquipment(eq) {
    if (selectedEq?.id === eq.id) {
      setSelectedEq(null)
      return
    }
    setSelectedEq(eq)
    setEmpSearch('')
    setEmpResults([])
    setShowHist(false)
    setHistory([])
  }

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const current = paginated
    if (selectedIds.size === current.length && current.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(current.map(e => e.id)))
    }
  }

  function toggleColumn(key) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function changeDensity() {
    const next = density === 'compact' ? 'normal' : density === 'normal' ? 'comfortable' : 'compact'
    setDensity(next)
  }

  const computedStats = useMemo(() => {
    const total = equipment.length
    const allocated = equipment.filter(e => e.employee_id).length
    const inStock = equipment.filter(e => !e.employee_id).length
    const maintenance = equipment.filter(e => e.status === 'Lỗi / Hỏng').length
    return { total, allocated, inStock, maintenance }
  }, [equipment])

  const filtered = useMemo(() => {
    let result = equipment
    if (typeFilter !== 'Tất cả') {
      result = result.filter(e => e.equipment_type === typeFilter)
    }
    if (healthFilter !== 'Tất cả') {
      result = result.filter(e => e.status === healthFilter)
    }
    return result
  }, [equipment, typeFilter, healthFilter])

  const sorted = useMemo(() => {
    if (!sortField) return filtered
    return [...filtered].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      if (sortField === 'status_label') {
        aVal = statusInfo(a).label
        bVal = statusInfo(b).label
      } else if (sortField === 'health_label') {
        aVal = HEALTH_MAP[a.status]?.label || a.status
        bVal = HEALTH_MAP[b.status]?.label || b.status
      } else {
        aVal = (aVal || '').toString().toLowerCase()
        bVal = (bVal || '').toString().toLowerCase()
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortField, sortDir])

  const pageCount = Math.ceil(sorted.length / pageSize)
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [typeFilter, healthFilter, search])

  const cat = selectedEq ? categorizeSpecs(selectedEq.specs) : {}
  const isAllSelected = paginated.length > 0 && selectedIds.size === paginated.length

  function renderSortIcon(field) {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.25, marginLeft: 3 }} />
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ marginLeft: 3, flexShrink: 0 }} />
      : <ChevronDown size={12} style={{ marginLeft: 3, flexShrink: 0 }} />
  }

  const statCards = [
    { key: 'total', label: 'Tổng thiết bị', value: computedStats.total, icon: Monitor, color: '#00468C', bg: '#e8f0fe' },
    { key: 'allocated', label: 'Đang sử dụng', value: computedStats.allocated, icon: Users, color: '#16a34a', bg: '#dcfce7' },
    { key: 'inStock', label: 'Trong kho', value: computedStats.inStock, icon: Box, color: '#d97706', bg: '#fef3c7' },
    { key: 'maintenance', label: 'Cần bảo trì', value: computedStats.maintenance, icon: AlertOctagon, color: '#dc2626', bg: '#fef2f2' },
  ]

  function renderBadge(label, bg, color) {
    return (
      <span className="eq-badge" style={{ background: bg, color }}>
        {label}
      </span>
    )
  }

  return (
    <div className="eq-page">
      <style>{`
        .eq-page { font-family: inherit; }
        .eq-page * { box-sizing: border-box; }

        @keyframes eqFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes eqSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes eqSkeleton { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }
        @keyframes eqPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

        .eq-skeleton {
          background: linear-gradient(90deg, #f1f5f9 25%, #e8ecf0 50%, #f1f5f9 75%);
          background-size: 200px 100%;
          animation: eqSkeleton 1.5s ease-in-out infinite;
          border-radius: 6px;
        }

        .eq-stat-card {
          background: #fff; border-radius: 12px; padding: 1.2rem 1.25rem;
          border: 1px solid #e6edf5; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
          transition: all 0.2s ease; cursor: default;
          display: flex; align-items: center; gap: 1rem;
        }
        .eq-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .eq-stat-icon {
          width: 44px; height: 44px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .eq-stat-value { font-size: 1.5rem; font-weight: 800; line-height: 1.2; }
        .eq-stat-label { font-size: 0.78rem; color: #64748b; font-weight: 500; }

        .eq-toolbar {
          position: sticky; top: 0; z-index: 50;
          background: #fff; border-radius: 12px; border: 1px solid #e6edf5;
          padding: 0.65rem 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
        }
        .eq-toolbar.stuck { border-radius: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

        .eq-search-wrap { position: relative; flex: 1; min-width: 200px; }
        .eq-search-wrap .eq-search-icon {
          position: absolute; left: 0.65rem; top: 50%; transform: translateY(-50%);
          pointer-events: none; color: #94a3b8;
        }
        .eq-search-wrap input {
          width: 100%; height: 36px; padding: 0 2rem 0 2.1rem;
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
          font-size: 0.82rem; outline: none; font-family: inherit; color: #0f172a;
          transition: all 0.15s;
        }
        .eq-search-wrap input:focus {
          border-color: #00468C; background: #fff;
          box-shadow: 0 0 0 3px rgba(0,70,140,0.1);
        }
        .eq-search-wrap .eq-search-clear {
          position: absolute; right: 0.4rem; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #94a3b8;
          padding: 4px; border-radius: 4px; display: flex;
        }
        .eq-search-wrap .eq-search-clear:hover { background: #f1f5f9; color: #64748b; }

        .eq-toolbar-btn {
          height: 36px; display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0 0.7rem; border-radius: 8px; font-size: 0.78rem; font-weight: 500;
          cursor: pointer; font-family: inherit; white-space: nowrap;
          border: 1px solid #e2e8f0; background: #fff; color: #475569;
          transition: all 0.12s;
        }
        .eq-toolbar-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
        .eq-toolbar-btn.primary { background: #00468C; color: #fff; border-color: #00468C; }
        .eq-toolbar-btn.primary:hover { background: #003570; }

        .eq-toolbar-select {
          height: 36px; padding: 0 0.6rem; border: 1px solid #e2e8f0;
          border-radius: 8px; background: #fff; font-size: 0.78rem;
          color: #334155; cursor: pointer; font-family: inherit; outline: none;
          min-width: 120px;
        }
        .eq-toolbar-select:hover { border-color: #cbd5e1; }

        .eq-table-wrap {
          background: #fff; border-radius: 12px; border: 1px solid #e6edf5;
          overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .eq-table-scroll { overflow-x: auto; }
        .eq-table {
          width: 100%; border-collapse: separate; border-spacing: 0;
        }
        .eq-table thead { position: sticky; top: 0; z-index: 10; }
        .eq-table thead th {
          background: #f8fafc; color: #475569; font-weight: 700;
          padding: 0.65rem 0.75rem; text-align: left; white-space: nowrap;
          border-bottom: 1px solid #e2e8f0; font-size: 0.72rem;
          text-transform: uppercase; letter-spacing: 0.04em;
          user-select: none; transition: background 0.1s;
        }
        .eq-table thead th.sortable { cursor: pointer; }
        .eq-table thead th.sortable:hover { background: #f1f5f9; }
        .eq-table thead th .th-inner {
          display: flex; align-items: center; gap: 0.25rem;
        }
        .eq-table tbody td {
          padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9;
          color: #334155; vertical-align: middle; font-size: 0.82rem;
          transition: background 0.1s;
        }
        .eq-table tbody tr { cursor: pointer; transition: background 0.1s; }
        .eq-table tbody tr:hover td { background: #f8fafc; }
        .eq-table tbody tr.eq-row-selected td { background: #eff6ff; }
        .eq-table tbody tr.eq-row-selected td:first-child { box-shadow: inset 3px 0 0 #00468C; }
        .eq-table tbody tr:last-child td { border-bottom: none; }

        .eq-density-compact td { padding-top: 0.35rem !important; padding-bottom: 0.35rem !important; font-size: 0.78rem !important; }
        .eq-density-comfortable td { padding-top: 0.65rem !important; padding-bottom: 0.65rem !important; font-size: 0.85rem !important; }

        .eq-badge {
          display: inline-flex; align-items: center; gap: 0.25rem;
          padding: 0.1rem 0.5rem; border-radius: 20px;
          font-size: 0.72rem; font-weight: 600; white-space: nowrap;
          line-height: 1.5;
        }

        .eq-checkbox {
          width: 16px; height: 16px; border-radius: 4px;
          border: 1.5px solid #cbd5e1; background: #fff;
          cursor: pointer; display: inline-flex; align-items: center;
          justify-content: center; transition: all 0.12s;
          flex-shrink: 0; appearance: none;
        }
        .eq-checkbox:checked {
          background: #00468C; border-color: #00468C;
        }

        .eq-action-btn {
          width: 30px; height: 30px; display: inline-flex; align-items: center;
          justify-content: center; border-radius: 6px; border: none;
          background: transparent; color: #94a3b8; cursor: pointer;
          transition: all 0.12s; position: relative;
        }
        .eq-action-btn:hover { background: #f1f5f9; color: #475569; }

        .eq-action-menu {
          position: absolute; right: 0; top: 100%; z-index: 100;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 170px;
          padding: 0.35rem; margin-top: 2px;
          animation: eqFadeIn 0.12s ease;
        }
        .eq-action-item {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.45rem 0.65rem; border-radius: 6px; font-size: 0.8rem;
          color: #334155; cursor: pointer; border: none; background: none;
          width: 100%; font-family: inherit; text-align: left;
          transition: background 0.1s;
        }
        .eq-action-item:hover { background: #f8fafc; }
        .eq-action-item.danger { color: #dc2626; }
        .eq-action-item.danger:hover { background: #fef2f2; }

        .eq-pagination {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.7rem 1rem; border-top: 1px solid #e2e8f0;
          background: #fafbfc; font-size: 0.78rem; color: #64748b;
          flex-wrap: wrap; gap: 0.5rem;
        }
        .eq-pagination .eq-page-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 6px; border: 1px solid #e2e8f0;
          background: #fff; color: #475569; cursor: pointer; font-size: 0.78rem;
          transition: all 0.12s; font-family: inherit;
        }
        .eq-pagination .eq-page-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
        .eq-pagination .eq-page-btn:disabled { opacity: 0.4; cursor: default; }
        .eq-pagination .eq-page-btn.active { background: #00468C; color: #fff; border-color: #00468C; }

        .eq-panel-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.25);
          z-index: 200; opacity: 0; pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .eq-panel-overlay.open { opacity: 1; pointer-events: auto; }

        .eq-side-panel {
          position: fixed; top: 0; right: -480px; width: 460px;
          height: 100vh; background: #fff; z-index: 201;
          transition: right 0.25s cubic-bezier(0.4,0,0.2,1);
          box-shadow: -4px 0 24px rgba(0,0,0,0.1);
          display: flex; flex-direction: column;
        }
        .eq-side-panel.open { right: 0; }

        .eq-panel-section { margin-bottom: 1rem; }
        .eq-panel-section-title {
          font-size: 0.68rem; color: #94a3b8; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em;
          margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem;
        }

        .eq-spec-card {
          background: #f8fafc; border-radius: 8px; padding: 0.6rem 0.8rem;
          margin-bottom: 0.4rem; border: 1px solid #f1f5f9;
          display: flex; align-items: center; gap: 0.6rem;
        }
        .eq-spec-card .eq-spec-icon {
          width: 28px; height: 28px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .eq-spec-label { font-size: 0.65rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; }
        .eq-spec-value { font-size: 0.82rem; color: #0f172a; font-weight: 500; }

        .eq-detail-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 1rem;
        }
        .eq-detail-item-label {
          font-size: 0.65rem; color: #94a3b8; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .eq-detail-item-value {
          font-size: 0.82rem; color: #0f172a; font-weight: 500;
        }

        .eq-timeline-entry {
          display: flex; gap: 0.65rem; padding: 0.5rem 0;
          border-bottom: 1px solid #f1f5f9;
        }
        .eq-timeline-entry:last-child { border-bottom: none; }
        .eq-timeline-dot {
          width: 8px; height: 8px; border-radius: 50%;
          margin-top: 6px; flex-shrink: 0;
        }
        .eq-timeline-content { font-size: 0.78rem; color: #475569; line-height: 1.4; }
        .eq-timeline-date { font-size: 0.7rem; color: #94a3b8; margin-top: 1px; }

        .eq-modal-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 300; backdrop-filter: blur(4px);
          animation: eqFadeIn 0.15s ease;
        }
        .eq-modal {
          background: #fff; border-radius: 16px; width: 600px;
          max-width: 95vw; max-height: 90vh; overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15);
          animation: eqFadeIn 0.15s ease;
        }
        .eq-modal::-webkit-scrollbar { width: 4px; }
        .eq-modal::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

        .eq-form-section {
          border-bottom: 1px solid #f1f5f9; padding: 1rem 1.5rem;
        }
        .eq-form-section:last-child { border-bottom: none; }
        .eq-form-section-title {
          font-size: 0.75rem; color: #00468C; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em;
          margin-bottom: 0.65rem; display: flex; align-items: center; gap: 0.35rem;
        }
        .eq-form-group { margin-bottom: 0.55rem; }
        .eq-form-group:last-child { margin-bottom: 0; }
        .eq-form-label {
          display: block; font-size: 0.72rem; color: #64748b;
          margin-bottom: 0.2rem; font-weight: 500;
        }
        .eq-form-input, .eq-form-select, .eq-form-textarea {
          width: 100%; padding: 0.45rem 0.65rem;
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
          font-size: 0.82rem; outline: none; font-family: inherit; color: #0f172a;
          transition: all 0.15s;
        }
        .eq-form-input:focus, .eq-form-select:focus, .eq-form-textarea:focus {
          border-color: #00468C; background: #fff;
          box-shadow: 0 0 0 3px rgba(0,70,140,0.1);
        }
        .eq-form-textarea { resize: vertical; min-height: 44px; }

        .eq-emp-item:hover { background: #eff6ff !important; }

        .eq-col-menu {
          position: absolute; right: 0; top: 100%; z-index: 100;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12); min-width: 180px;
          padding: 0.35rem; margin-top: 2px;
          animation: eqFadeIn 0.12s ease;
        }
        .eq-col-item {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.4rem 0.65rem; border-radius: 6px; font-size: 0.8rem;
          color: #334155; cursor: pointer; border: none; background: none;
          width: 100%; font-family: inherit; text-align: left;
          transition: background 0.1s;
        }
        .eq-col-item:hover { background: #f8fafc; }
        .eq-col-item .eq-col-check {
          width: 16px; height: 16px; border-radius: 3px;
          border: 1.5px solid #cbd5e1; display: flex; align-items: center;
          justify-content: center; flex-shrink: 0; background: #fff;
        }
        .eq-col-item .eq-col-check.checked { background: #00468C; border-color: #00468C; }

        .eq-raw-box {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
          padding: 0.5rem 0.65rem; font-size: 0.75rem; color: #64748b;
          font-family: monospace; max-height: 64px; overflow-y: auto;
          line-height: 1.4; white-space: pre-wrap; word-break: break-all;
        }
        .eq-raw-box::-webkit-scrollbar { width: 3px; }
        .eq-raw-box::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
      `}</style>

      {/* Toast */}
      {msg && (
        <div className="eq-toast" style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: msg.startsWith('Lỗi') ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${msg.startsWith('Lỗi') ? '#fca5a5' : '#86efac'}`,
          borderRadius: 12, padding: '0.75rem 1rem',
          color: msg.startsWith('Lỗi') ? '#991b1b' : '#166534',
          fontSize: '0.85rem', fontWeight: 600,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          animation: 'eqSlideIn 0.25s ease',
        }}>
          {msg.startsWith('Lỗi') ? <XCircle size={18} /> : <CheckCircle size={18} />}
          {msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Monitor size={24} style={{ color: '#00468C' }} />
            Quản lý thiết bị
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.15rem 0 0 0' }}>
            Quản lý toàn bộ tài sản CNTT — máy tính, thiết bị ngoại vi và linh kiện
          </p>
        </div>
        <button onClick={openCreate} className="eq-toolbar-btn primary" style={{ height: 40, padding: '0 1.1rem', fontSize: '0.85rem', flexShrink: 0 }}>
          <Plus size={16} />
          Thêm thiết bị
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {loading ? statCards.map(s => (
          <div key={s.key} className="eq-stat-card" style={{ opacity: 0.7 }}>
            <div className="eq-stat-icon" style={{ background: '#f1f5f9' }} />
            <div style={{ flex: 1 }}>
              <div className="eq-skeleton" style={{ width: 60, height: 24, marginBottom: 4 }} />
              <div className="eq-skeleton" style={{ width: 90, height: 12 }} />
            </div>
          </div>
        )) : statCards.map(s => {
          const Icon = s.icon
          return (
            <div key={s.key} className="eq-stat-card">
              <div className="eq-stat-icon" style={{ background: s.bg }}>
                <Icon size={22} style={{ color: s.color }} />
              </div>
              <div>
                <div className="eq-stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="eq-stat-label">{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="eq-toolbar" style={{ marginBottom: '0.75rem' }}>
        <div className="eq-search-wrap">
          <Search size={16} className="eq-search-icon" />
          <input
            type="text"
            placeholder="Tìm theo mã TS, S/N, loại..."
            value={searchInput}
            onChange={handleSearchInput}
          />
          {searchInput && (
            <button className="eq-search-clear" onClick={clearSearch}>
              <X size={14} />
            </button>
          )}
        </div>

        <select
          className="eq-toolbar-select"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          {['Tất cả', ...TYPE_OPTIONS].map(t => (
            <option key={t} value={t}>{t === 'Tất cả' ? 'Tất cả loại' : t}</option>
          ))}
        </select>

        <select
          className="eq-toolbar-select"
          value={storageTab}
          onChange={e => setStorageTab(e.target.value)}
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="allocated">Đang sử dụng</option>
          <option value="in_stock">Trong kho</option>
        </select>

        <select
          className="eq-toolbar-select"
          value={healthFilter}
          onChange={e => setHealthFilter(e.target.value)}
        >
          <option value="Tất cả">Tất cả sức khỏe</option>
          {Object.entries(HEALTH_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginLeft: 'auto' }}>
          <button className="eq-toolbar-btn" onClick={load} title="Làm mới">
            <RefreshCw size={15} />
          </button>
          <button className="eq-toolbar-btn" onClick={changeDensity} title={`Mật độ: ${density}`}>
            {density === 'compact' ? <List size={15} /> : density === 'normal' ? <GripHorizontal size={15} /> : <List size={15} />}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="eq-toolbar-btn"
              onClick={() => setColumnMenuOpen(prev => !prev)}
              title="Cột hiển thị"
            >
              <Columns size={15} />
            </button>
            {columnMenuOpen && (
              <div className="eq-col-menu">
                {ALL_COLUMNS.map(c => (
                  <button
                    key={c.key}
                    className="eq-col-item"
                    onClick={() => toggleColumn(c.key)}
                  >
                    <div className={`eq-col-check ${visibleCols.has(c.key) ? 'checked' : ''}`}>
                      {visibleCols.has(c.key) && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data table */}
      <div className="eq-table-wrap">
        <div className="eq-table-scroll">
          <table className={`eq-table ${density === 'compact' ? 'eq-density-compact' : density === 'comfortable' ? 'eq-density-comfortable' : ''}`}>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="eq-checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={col.sortable ? 'sortable' : ''}
                    style={{ minWidth: col.minWidth }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="th-inner">
                      {col.label}
                      {col.sortable && renderSortIcon(col.key)}
                    </div>
                  </th>
                ))}
                <th style={{ width: 44, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={`s-${i}`}>
                    <td><div className="eq-skeleton" style={{ width: 16, height: 16 }} /></td>
                    {columns.map(col => (
                      <td key={col.key}>
                        <div className="eq-skeleton" style={{ height: 12, width: col.key === 'asset_code' ? '65%' : col.key === 'serial_number' ? '55%' : '75%' }} />
                      </td>
                    ))}
                    <td><div className="eq-skeleton" style={{ width: 24, height: 24, borderRadius: 6 }} /></td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Package size={40} style={{ color: '#cbd5e1' }} />
                      <div style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>Không có thiết bị nào</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Thêm thiết bị mới hoặc điều chỉnh bộ lọc</div>
                    </div>
                  </td>
                </tr>
              ) : paginated.map(eq => {
                const st = statusInfo(eq)
                const h = HEALTH_MAP[eq.status] || { label: eq.status || '—', bg: '#f1f5f9', color: '#64748b', icon: null }
                const sel = selectedEq?.id === eq.id
                const checked = selectedIds.has(eq.id)
                const IconType = TYPE_ICONS[eq.equipment_type] || Package
                return (
                  <tr
                    key={eq.id}
                    className={sel ? 'eq-row-selected' : ''}
                    onClick={() => selectEquipment(eq)}
                  >
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="eq-checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(eq.id)}
                      />
                    </td>
                    {columns.map(col => {
                      if (col.key === 'asset_code') {
                        return (
                          <td key={col.key}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{
                                width: 28, height: 28, borderRadius: 6,
                                background: '#f1f5f9', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', flexShrink: 0,
                              }}>
                                <IconType size={14} style={{ color: '#64748b' }} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.82rem' }}>
                                  <span style={{ color: '#00468C' }}>[{eq.asset_code}]</span> {eq.equipment_type || '—'}
                                </div>
                              </div>
                            </div>
                          </td>
                        )
                      }
                      if (col.key === 'serial_number') {
                        return (
                          <td key={col.key} style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569' }}>
                            {eq.serial_number || <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>
                        )
                      }
                      if (col.key === 'full_name') {
                        return (
                          <td key={col.key}>
                            {eq.employee_id ? (
                              <div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 500, color: '#0f172a' }}>{eq.full_name}</div>
                                {eq.department && (
                                  <span style={{ display: 'inline-block', padding: '0.05rem 0.35rem', borderRadius: 4, background: '#f1f5f9', color: '#64748b', fontSize: '0.68rem', marginTop: 1 }}>{eq.department}</span>
                                )}
                              </div>
                            ) : <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>—</span>}
                          </td>
                        )
                      }
                      if (col.key === 'status_label') {
                        return (
                          <td key={col.key}>
                            {renderBadge(st.label, st.bg, st.color)}
                          </td>
                        )
                      }
                      if (col.key === 'health_label') {
                        const hIcon = h.icon
                        return (
                          <td key={col.key}>
                            <span className="eq-badge" style={{ background: h.bg, color: h.color }}>
                              {hIcon && <hIcon size={11} />}
                              {h.label}
                            </span>
                          </td>
                        )
                      }
                      return <td key={col.key}>{eq[col.key] || '—'}</td>
                    })}
                    <td style={{ textAlign: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
                      <button
                        className="eq-action-btn"
                        onClick={() => setActionMenuId(actionMenuId === eq.id ? null : eq.id)}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {actionMenuId === eq.id && (
                        <div className="eq-action-menu" ref={actionRef}>
                          <button className="eq-action-item" onClick={() => { setActionMenuId(null); selectEquipment(eq) }}>
                            <Eye size={14} /> Xem chi tiết
                          </button>
                          <button className="eq-action-item" onClick={() => { setActionMenuId(null); openEdit(eq) }}>
                            <Pencil size={14} /> Chỉnh sửa
                          </button>
                          {eq.employee_id ? (
                            <button className="eq-action-item" onClick={() => { setActionMenuId(null); handleRevoke(eq) }}>
                              <Undo2 size={14} /> Thu hồi
                            </button>
                          ) : (
                            <button className="eq-action-item" onClick={() => { setActionMenuId(null); selectEquipment(eq); setEmpSearch('') }}>
                              <UserPlus size={14} /> Cấp phát
                            </button>
                          )}
                          <button className="eq-action-item" onClick={() => { setActionMenuId(null); loadHistory(eq.id) }}>
                            <History size={14} /> Lịch sử
                          </button>
                          <button className="eq-action-item danger" onClick={() => { setActionMenuId(null); handleRevoke(eq) }}>
                            <Trash2 size={14} /> Xóa
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="eq-pagination">
          <span>
            {loading ? 'Đang tải...' : (
              <>
                Hiển thị {sorted.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} / {sorted.length} thiết bị
                {selectedIds.size > 0 && <span style={{ marginLeft: '0.5rem', color: '#00468C', fontWeight: 600 }}>(chọn {selectedIds.size})</span>}
              </>
            )}
          </span>
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <button className="eq-page-btn" disabled={page <= 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
              let pageNum
              if (pageCount <= 7) {
                pageNum = i + 1
              } else if (page <= 4) {
                pageNum = i + 1
              } else if (page >= pageCount - 3) {
                pageNum = pageCount - 6 + i
              } else {
                pageNum = page - 3 + i
              }
              return (
                <button
                  key={pageNum}
                  className={`eq-page-btn ${page === pageNum ? 'active' : ''}`}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </button>
              )
            })}
            <button className="eq-page-btn" disabled={page >= pageCount} onClick={() => setPage(prev => Math.min(pageCount, prev + 1))}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Panel overlay */}
      <div className={`eq-panel-overlay ${selectedEq ? 'open' : ''}`} onClick={() => setSelectedEq(null)} />

      {/* Detail drawer */}
      <div className={`eq-side-panel ${selectedEq ? 'open' : ''}`}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            {selectedEq && (() => {
              const IconType = TYPE_ICONS[selectedEq.equipment_type] || Package
              return <IconType size={22} style={{ color: '#00468C', flexShrink: 0 }} />
            })()}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                [{selectedEq?.asset_code}] {selectedEq?.equipment_type}
              </div>
              {selectedEq?.serial_number && (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>S/N: {selectedEq.serial_number}</div>
              )}
            </div>
          </div>
          <button onClick={() => setSelectedEq(null)} style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b', flexShrink: 0,
          }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {selectedEq && (
            <>
              {/* Badges row */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {(() => {
                  const st = statusInfo(selectedEq)
                  return renderBadge(st.label, st.bg, st.color)
                })()}
                {(() => {
                  const h = HEALTH_MAP[selectedEq.status] || { label: selectedEq.status || '—', bg: '#f1f5f9', color: '#64748b' }
                  return renderBadge(h.label, h.bg, h.color)
                })()}
                {selectedEq.issued_date && (
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Clock size={12} /> {selectedEq.issued_date}
                  </span>
                )}
              </div>

              {/* Quick actions */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {selectedEq.employee_id ? (
                  <>
                    <button onClick={() => handleRevoke(selectedEq)} className="eq-toolbar-btn" style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}>
                      <Undo2 size={14} /> Thu hồi
                    </button>
                    <button onClick={() => { setEmpSearch(''); setEmpResults([]) }} className="eq-toolbar-btn">
                      <UserPlus size={14} /> Bàn giao
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setEmpSearch(''); setEmpResults([]) }} className="eq-toolbar-btn" style={{ background: '#e8f0fe', color: '#00468C', borderColor: '#b3d0f0' }}>
                    <UserPlus size={14} /> Cấp phát
                  </button>
                )}
                <button onClick={() => openEdit(selectedEq)} className="eq-toolbar-btn">
                  <Pencil size={14} /> Sửa
                </button>
                <button onClick={() => loadHistory(selectedEq.id)} className="eq-toolbar-btn">
                  <History size={14} /> {showHist ? 'Ẩn lịch sử' : 'Lịch sử'}
                </button>
              </div>

              {/* Employee search for allocation */}
              {selectedEq && !selectedEq.employee_id && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ position: 'relative', marginBottom: '0.3rem' }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                    <input
                      type="text"
                      placeholder="Tìm nhân viên (mã, tên, bộ phận)..."
                      value={empSearch}
                      onChange={e => searchEmp(e.target.value)}
                      className="eq-form-input"
                      style={{ paddingLeft: '1.7rem' }}
                    />
                  </div>
                  {empResults.length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                      {empResults.map(t => (
                        <div
                          key={t.id}
                          className="eq-emp-item"
                          onClick={() => handleAllocate(selectedEq.id, t)}
                          style={{
                            padding: '0.4rem 0.7rem', fontSize: '0.8rem', cursor: 'pointer',
                            borderBottom: '1px solid #f1f5f9', color: '#0f172a',
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{t.full_name}</span>
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}> ({t.employee_code} — {t.department})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {empSearch.trim() && empResults.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Không tìm thấy nhân viên.</div>
                  )}
                </div>
              )}

              {/* Info section */}
              <div className="eq-panel-section">
                <div className="eq-panel-section-title">
                  <Info size={13} /> Thông tin chung
                </div>
                <div className="eq-detail-grid">
                  <div>
                    <div className="eq-detail-item-label">Mã tài sản</div>
                    <div className="eq-detail-item-value" style={{ fontFamily: 'monospace' }}>{selectedEq.asset_code || '—'}</div>
                  </div>
                  <div>
                    <div className="eq-detail-item-label">Loại thiết bị</div>
                    <div className="eq-detail-item-value">{selectedEq.equipment_type || '—'}</div>
                  </div>
                  <div>
                    <div className="eq-detail-item-label">Serial Number</div>
                    <div className="eq-detail-item-value" style={{ fontFamily: 'monospace' }}>{selectedEq.serial_number || '—'}</div>
                  </div>
                  <div>
                    <div className="eq-detail-item-label">Ngày cấp</div>
                    <div className="eq-detail-item-value">{selectedEq.issued_date || '—'}</div>
                  </div>
                  <div>
                    <div className="eq-detail-item-label">Người sử dụng</div>
                    <div className="eq-detail-item-value">{selectedEq.full_name || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                  </div>
                  <div>
                    <div className="eq-detail-item-label">Bộ phận</div>
                    <div className="eq-detail-item-value">{selectedEq.department || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                  </div>
                </div>
              </div>

              {/* Specs section */}
              {selectedEq.specs && (
                <div className="eq-panel-section">
                  <div className="eq-panel-section-title">
                    <HardDrive size={13} /> Thông số kỹ thuật
                  </div>
                  {cat.cpu && (
                    <div className="eq-spec-card" style={{ borderLeft: '3px solid #3b82f6' }}>
                      <div className="eq-spec-icon" style={{ background: '#dbeafe' }}>
                        <Cpu size={14} style={{ color: '#3b82f6' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eq-spec-label">CPU</div>
                        <div className="eq-spec-value" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.cpu}</div>
                      </div>
                    </div>
                  )}
                  {cat.ram && (
                    <div className="eq-spec-card" style={{ borderLeft: '3px solid #8b5cf6' }}>
                      <div className="eq-spec-icon" style={{ background: '#ede9fe' }}>
                        <Wifi size={14} style={{ color: '#8b5cf6' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eq-spec-label">RAM</div>
                        <div className="eq-spec-value">{cat.ram}</div>
                      </div>
                    </div>
                  )}
                  {cat.storage && (
                    <div className="eq-spec-card" style={{ borderLeft: '3px solid #06b6d4' }}>
                      <div className="eq-spec-icon" style={{ background: '#cffafe' }}>
                        <HardDrive size={14} style={{ color: '#06b6d4' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eq-spec-label">Ổ cứng</div>
                        <div className="eq-spec-value">{cat.storage}</div>
                      </div>
                    </div>
                  )}
                  {cat.os && (
                    <div className="eq-spec-card" style={{ borderLeft: '3px solid #f59e0b' }}>
                      <div className="eq-spec-icon" style={{ background: '#fef3c7' }}>
                        <Monitor size={14} style={{ color: '#f59e0b' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eq-spec-label">Hệ điều hành</div>
                        <div className="eq-spec-value">{cat.os}</div>
                      </div>
                    </div>
                  )}
                  {cat.other.length > 0 && (
                    <div className="eq-spec-card" style={{ borderLeft: '3px solid #94a3b8' }}>
                      <div className="eq-spec-icon" style={{ background: '#f1f5f9' }}>
                        <Package size={14} style={{ color: '#94a3b8' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eq-spec-label">Thông số khác</div>
                        <div className="eq-spec-value">{cat.other.join(' | ')}</div>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: '0.4rem' }}>
                    <div className="eq-spec-label" style={{ marginBottom: '0.2rem' }}>Thông số gốc</div>
                    <div className="eq-raw-box">{selectedEq.specs}</div>
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedEq.description && (
                <div className="eq-panel-section">
                  <div className="eq-panel-section-title">
                    <FileDown size={13} /> Mô tả
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, background: '#f8fafc', borderRadius: 8, padding: '0.5rem 0.7rem', border: '1px solid #f1f5f9' }}>
                    {selectedEq.description}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedEq.notes && (
                <div className="eq-panel-section">
                  <div className="eq-panel-section-title">
                    <FileDown size={13} /> Ghi chú
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, background: '#fefce8', borderRadius: 8, padding: '0.5rem 0.7rem', border: '1px solid #fef08a' }}>
                    {selectedEq.notes}
                  </div>
                </div>
              )}

              {/* History */}
              {showHist && (
                <div className="eq-panel-section" style={{ animation: 'eqSlideIn 0.15s ease' }}>
                  <div className="eq-panel-section-title">
                    <History size={13} /> Lịch sử bàn giao
                  </div>
                  {historyLoading ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Loader2 size={14} style={{ animation: 'eqPulse 1s infinite' }} /> Đang tải...
                    </div>
                  ) : history.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: 8 }}>
                      Chưa có lịch sử bàn giao
                    </div>
                  ) : (
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {history.map(h => (
                        <div key={h.id} className="eq-timeline-entry">
                          <div className="eq-timeline-dot" style={{ background: h.return_date ? '#94a3b8' : '#16a34a' }} />
                          <div>
                            <div className="eq-timeline-content">
                              <span style={{ fontWeight: 500 }}>{h.employee_name}</span> ({h.employee_code})
                            </div>
                            <div className="eq-timeline-content">
                              Bàn giao: {h.handover_date || '?'}
                              {h.return_date ? ` → Thu hồi: ${h.return_date}` : ' → Đang sử dụng'}
                            </div>
                            <div className="eq-timeline-date">{formatDate(h.created_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="eq-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="eq-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSave}>
              {/* Modal header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0',
              }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {editId ? <><Pencil size={18} /> Chỉnh sửa thiết bị</> : <><Plus size={18} /> Thêm thiết bị mới</>}
                </h3>
                <button type="button" onClick={() => setShowForm(false)} style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b',
                }}>
                  <X size={16} />
                </button>
              </div>

              {/* General section */}
              <div className="eq-form-section">
                <div className="eq-form-section-title">
                  <Monitor size={14} /> Thông tin chung
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
                  <div className="eq-form-group">
                    <label className="eq-form-label">Mã tài sản *</label>
                    <input type="text" className="eq-form-input" value={form.asset_code}
                      onChange={e => setForm({ ...form, asset_code: e.target.value })} required />
                  </div>
                  <div className="eq-form-group">
                    <label className="eq-form-label">Loại thiết bị *</label>
                    <select className="eq-form-select" value={form.equipment_type}
                      onChange={e => setForm({ ...form, equipment_type: e.target.value })} required>
                      <option value="">-- Chọn loại --</option>
                      {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="eq-form-group">
                    <label className="eq-form-label">Serial Number</label>
                    <input type="text" className="eq-form-input" value={form.serial_number}
                      onChange={e => setForm({ ...form, serial_number: e.target.value })} />
                  </div>
                  <div className="eq-form-group">
                    <label className="eq-form-label">Tình trạng sức khỏe</label>
                    <select className="eq-form-select" value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="">-- Chọn --</option>
                      {Object.keys(HEALTH_MAP).map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Specs section */}
              <div className="eq-form-section">
                <div className="eq-form-section-title">
                  <HardDrive size={14} /> Thông số kỹ thuật
                </div>
                <div className="eq-form-group">
                  <label className="eq-form-label">Cấu hình chi tiết</label>
                  <input type="text" className="eq-form-input" value={form.specs}
                    onChange={e => setForm({ ...form, specs: e.target.value })} placeholder="VD: Core i5-12400 | 16GB DDR4 | SSD 512GB | Windows 11" />
                </div>
              </div>

              {/* Purchase / Issue section */}
              <div className="eq-form-section">
                <div className="eq-form-section-title">
                  <CalendarDays size={14} /> Ngày cấp
                </div>
                <div className="eq-form-group" style={{ maxWidth: 250 }}>
                  <label className="eq-form-label">Ngày cấp</label>
                  <input type="date" className="eq-form-input" value={form.issued_date}
                    onChange={e => setForm({ ...form, issued_date: e.target.value })} />
                </div>
              </div>

              {/* Notes section */}
              <div className="eq-form-section">
                <div className="eq-form-section-title">
                  <FileDown size={14} /> Mô tả & Ghi chú
                </div>
                <div className="eq-form-group">
                  <label className="eq-form-label">Mô tả</label>
                  <input type="text" className="eq-form-input" value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Mô tả ngắn về thiết bị" />
                </div>
                <div className="eq-form-group">
                  <label className="eq-form-label">Ghi chú</label>
                  <textarea className="eq-form-textarea" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Ghi chú nội bộ..." />
                </div>
              </div>

              {/* Footer */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
                padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#fafbfc',
              }}>
                <button type="button" onClick={() => setShowForm(false)} className="eq-toolbar-btn" style={{ height: 38, padding: '0 1rem' }}>
                  Hủy bỏ
                </button>
                <button type="submit" disabled={saving} className="eq-toolbar-btn primary" style={{ height: 38, padding: '0 1.25rem', fontSize: '0.85rem' }}>
                  {saving ? <><Loader2 size={15} style={{ animation: 'eqPulse 1s infinite' }} /> Đang lưu...</> : <><CheckCircle size={16} /> {editId ? 'Cập nhật' : 'Thêm mới'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}



