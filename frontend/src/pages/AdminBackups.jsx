import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Download, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react'
import { createModuleBackup, deleteModuleBackup, downloadModuleBackup, getModuleBackups, restoreModuleBackup, scanModuleBackup, uploadModuleBackup } from '../services/api'
import './AdminBackups.css'

const today = new Date()
const endDefault = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10)
const startDefault = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10)
const MODULES = { todos: 'Todos', bookings: 'Booking', employees: 'Nhân viên' }
const errorText = (error, fallback) => typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : fallback

export default function AdminBackups() {
  const [module, setModule] = useState('todos')
  const [startDate, setStartDate] = useState(startDefault)
  const [endDate, setEndDate] = useState(endDefault)
  const [preview, setPreview] = useState(null)
  const [selected, setSelected] = useState([])
  const [backups, setBackups] = useState([])
  const [cleanup, setCleanup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const selectedCount = selected.length
  const allSelected = useMemo(() => !!preview?.records?.length && selectedCount === preview.records.length, [preview, selectedCount])

  const refreshBackups = async () => setBackups((await getModuleBackups()).data?.data || [])
  useEffect(() => { refreshBackups().catch(() => {}) }, [])
  const reset = () => { setPreview(null); setSelected([]); setCleanup(false); setError('') }

  const scan = async () => {
    setBusy(true); setError('')
    try {
      const data = (await scanModuleBackup(module, startDate, endDate)).data?.data
      setPreview(data); setSelected((data?.records || []).map(row => row.id)); setCleanup(false)
    } catch (err) { setError(errorText(err, 'Không thể scan dữ liệu module.')) }
    finally { setBusy(false) }
  }
  const create = async () => {
    if (!selectedCount) return setError('Chọn ít nhất một bản ghi.')
    const action = cleanup ? 'backup và dọn' : 'tạo snapshot'
    if (!confirm(`${action} ${selectedCount} bản ghi ${MODULES[module]}?`)) return
    setBusy(true); setError('')
    try { await createModuleBackup(module, startDate, endDate, selected, cleanup); await refreshBackups(); setPreview(null); setSelected([]) }
    catch (err) { setError(errorText(err, 'Không thể tạo backup.')) }
    finally { setBusy(false) }
  }
  const upload = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    setBusy(true); setError('')
    try { await uploadModuleBackup(file); await refreshBackups() }
    catch (err) { setError(errorText(err, 'Không thể upload backup.')) }
    finally { setBusy(false) }
  }
  const restore = async filename => {
    if (!confirm(`Khôi phục ${filename}? Bản ghi đã tồn tại sẽ được bỏ qua.`)) return
    setBusy(true); setError('')
    try { const result=(await restoreModuleBackup(filename)).data?.data; alert(`Đã khôi phục ${result.restored_records}, bỏ qua ${result.skipped_records}.`) }
    catch (err) { setError(errorText(err, 'Không thể restore backup.')) }
    finally { setBusy(false) }
  }
  const download = async filename => { const response=await downloadModuleBackup(filename); const url=URL.createObjectURL(response.data); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url) }
  const remove = async filename => { if (!confirm(`Xóa ${filename} khỏi server?`)) return; await deleteModuleBackup(filename); await refreshBackups() }

  return <div className="module-backups-page">
    <header><div><h1><Archive size={22}/> Admin Backup dữ liệu</h1><p>Scan, snapshot, dọn và khôi phục Todos, Booking, Nhân viên.</p></div><button onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={16}/> Upload ZIP</button><input ref={fileRef} hidden type="file" accept=".zip" onChange={upload}/></header>
    <section className="backup-panel">
      <div className="backup-controls">
        <label>Module<select value={module} onChange={e=>{setModule(e.target.value);reset()}}>{Object.entries(MODULES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Từ ngày<input type="date" value={startDate} onChange={e=>{setStartDate(e.target.value);reset()}}/></label>
        <label>Đến ngày<input type="date" value={endDate} onChange={e=>{setEndDate(e.target.value);reset()}}/></label>
        <button onClick={scan} disabled={busy}><RefreshCw size={16}/> Scan dữ liệu</button>
      </div>
      {error && <div className="backup-error">{error}</div>}
      {preview && <div className="backup-preview">
        <div className="backup-preview-head"><strong>{preview.record_count} bản ghi</strong><label><input type="checkbox" checked={allSelected} onChange={e=>setSelected(e.target.checked?preview.records.map(row=>row.id):[])}/> Chọn tất cả</label></div>
        {!!Object.keys(preview.related_counts || {}).length && <div className="backup-dependencies">Dữ liệu liên quan: {Object.entries(preview.related_counts).map(([name,count])=>`${name}: ${count}`).join(' · ')}</div>}
        <div className="backup-records">{preview.records.map(row=><label key={row.id}><input type="checkbox" checked={selected.includes(row.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,row.id]:ids.filter(id=>id!==row.id))}/><span><b>{row.title}</b><small>{row.subtitle} · {row.date}</small></span></label>)}</div>
        <div className="backup-actions">{preview.cleanup_allowed ? <label className="danger"><input type="checkbox" checked={cleanup} onChange={e=>setCleanup(e.target.checked)}/> Dọn dữ liệu sau khi ZIP được kiểm tra</label> : <span className="safe-note">Nhân viên chỉ snapshot; không tự động xóa để bảo vệ dữ liệu liên kết.</span>}<button onClick={create} disabled={busy||!selectedCount}><Archive size={16}/> {cleanup?'Backup và dọn':'Tạo snapshot'} ({selectedCount})</button></div>
      </div>}
    </section>
    <section className="backup-panel"><h2>Backup trên server</h2>{!backups.length&&<p>Chưa có backup module.</p>}{backups.map(item=><div className="backup-row" key={item.filename}><div><b>{item.filename}</b><small>{MODULES[item.module]||item.module} · {item.record_count||0} bản ghi · {item.file_count||0} file · {Math.ceil((item.size||0)/1024)} KB</small>{item.missing_file_count>0&&<small className="backup-error">Thiếu {item.missing_file_count} file vật lý tại lúc backup</small>}{item.error&&<small className="backup-error">{item.error}</small>}</div>{!item.error&&<div><button title="Tải xuống" onClick={()=>download(item.filename)}><Download size={16}/></button><button title="Khôi phục" onClick={()=>restore(item.filename)}><RotateCcw size={16}/></button><button title="Xóa" onClick={()=>remove(item.filename)}><Trash2 size={16}/></button></div>}</div>)}</section>
  </div>
}
