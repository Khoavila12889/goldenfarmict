import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, RefreshCw, ShoppingCart, X, Package, UserRound, CalendarDays, Banknote, FileText, ChevronLeft, ChevronRight, LayoutGrid, Table2, Copy, Eye } from 'lucide-react'
import { apiErrorMessage, getOrderDetail, getOrders } from '../services/api'
import './Orders.css'

const money = value => new Intl.NumberFormat('vi-VN').format(Math.round(Number(value || 0)))
const date = value => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—'
const orderCreatedAt = order => {
  const day = date(order.ngay_tao || order.ngay_ct)
  const rawTime = String(order.gio_tao || '').trim()
  return rawTime ? `${day} · ${rawTime.slice(0, 8)}` : day
}
const PAGE_SIZE_DETAIL = 50

function resolveTotals(order) {
  const truoc = Number(order.tong_tien_truoc_thue ?? order.tong_tien ?? 0)
  const thue = Number(order.tong_thue ?? 0)
  let sau = Number(order.tong_tien_sau_thue ?? 0)
  if (!sau && truoc) sau = truoc + thue
  return { truoc, thue, sau, coThue: Number(order.thue_yn ?? 0) > 0 || thue > 0 }
}

function lineAmounts(item) {
  const truoc = Number(item.tien_truoc_thue ?? item.thanh_tien ?? 0)
  const thue = Number(item.thue ?? 0)
  const sau = Number(item.tien_sau_thue ?? (truoc + thue))
  return { truoc, thue, sau, thueSuat: Number(item.thue_suat ?? 0) }
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('today')
  const [query, setQuery] = useState('')
  const [serverQuery, setServerQuery] = useState('')
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('orders-view-mode') || 'cards')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const known = useRef(new Set())
  const [newIds, setNewIds] = useState(new Set())

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await getOrders({ status, q: serverQuery, page, page_size: 20 })
      const rows = response.data.orders || []
      if (known.current.size) {
        const fresh = rows.filter(row => !known.current.has(row.so_ct)).map(row => row.so_ct)
        if (fresh.length) setNewIds(new Set(fresh))
      }
      rows.forEach(row => known.current.add(row.so_ct))
      setOrders(rows)
      setTotal(response.data.total || 0)
      setError('')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [status, serverQuery, page])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = setInterval(() => void load(true), 30000)
    return () => clearInterval(timer)
  }, [load])

  const openDetail = async orderNumber => {
    setDetailLoading(true)
    setSelected({ phieu_to2: { so_ct: orderNumber }, chi_tiet: [] })
    try {
      const response = await getOrderDetail(orderNumber)
      setSelected(response.data.order)
      setNewIds(ids => { const next = new Set(ids); next.delete(orderNumber); return next })
    } catch (err) {
      setError(apiErrorMessage(err))
      setSelected(null)
    } finally { setDetailLoading(false) }
  }

  const maxPage = Math.max(1, Math.ceil(total / 20))
  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('vi')
    if (!needle) return orders
    return orders.filter(order =>
      String(order.so_ct || '').toLocaleLowerCase('vi').includes(needle) ||
      String(order.ten_kh || '').toLocaleLowerCase('vi').includes(needle) ||
      String(order.ma_kh || '').toLocaleLowerCase('vi').includes(needle)
    )
  }, [orders, query])

  const changeView = mode => {
    setViewMode(mode)
    localStorage.setItem('orders-view-mode', mode)
  }

  const copyOrderCode = async (event, code) => {
    event.stopPropagation()
    try { await navigator.clipboard.writeText(code) } catch { setError(`Không thể sao chép mã ${code}`) }
  }

  const renderCards = extraClass => (
    <div className={`orders-grid ${extraClass || ''}`.trim()}>
      {visibleOrders.map(order => {
        const t = resolveTotals(order)
        return (
          <article className={`order-card ${newIds.has(order.so_ct) ? 'is-new' : ''}`} key={order.so_ct}>
            <div className="order-card-top"><span className="order-number">{order.so_ct}</span>{newIds.has(order.so_ct) && <span className="new-badge">MỚI</span>}</div>
            <h3>{order.ten_kh}</h3>
            <div className="order-meta">
              <span className="order-created-at" title="Thời gian tạo đơn"><CalendarDays size={14} />{orderCreatedAt(order)}</span>
              <span className="order-card-total"><Banknote size={14} /><b>{t.coThue ? `${money(t.sau)} đ` : `${money(t.truoc)} đ`}</b></span>
            </div>
            <div className="order-footer"><span className={`status status-${String(order.status)}`}>{order.status_text}</span><span>{order.da_xuat ? '✓ Đã xuất kho' : '○ Chưa xuất kho'}</span></div>
            <div className="order-actions">
              <button type="button" onClick={event => copyOrderCode(event, order.so_ct)} title="Sao chép số chứng từ"><Copy size={14} /> Sao chép</button>
              <button type="button" className="primary" onClick={() => openDetail(order.so_ct)}><Eye size={14} /> Chi tiết</button>
            </div>
          </article>
        )
      })}
    </div>
  )

  return (
    <main className="orders-page">
      <header className="orders-hero">
        <div className="orders-title">
          <span className="orders-title-icon"><ShoppingCart size={20} /></span>
          <div><span className="orders-eyebrow">SALES WORKSPACE</span><h1>Trung tâm đơn hàng</h1></div>
        </div>
        <div className="orders-metrics" aria-label="Thống kê đơn hàng">
          <span><small>Kết quả</small><strong>{total}</strong></span>
          <span><small>Đơn mới</small><strong>{newIds.size}</strong></span>
          <span><small>Trang</small><strong>{page}/{maxPage}</strong></span>
        </div>
        <button className="orders-refresh" onClick={() => load()} disabled={loading}>
          <RefreshCw size={17} className={loading ? 'spin' : ''} /> Làm mới
        </button>
      </header>

      <section className="orders-panel">
        <div className="orders-toolbar">
          <div className="orders-tabs">
            {[['today', 'Hôm nay'], ['open', 'Chưa duyệt'], ['all', 'Tất cả']].map(([key, label]) => (
              <button key={key} className={status === key ? 'active' : ''} onClick={() => { setStatus(key); setPage(1); known.current.clear() }}>{label}</button>
            ))}
          </div>
          <div className="orders-tools">
            <form className="orders-search" onSubmit={event => { event.preventDefault(); setPage(1); setServerQuery(query.trim()) }}>
              <Search size={17} /><input value={query} onChange={e => { setQuery(e.target.value); if (!e.target.value) { setServerQuery(''); setPage(1) } }} placeholder="Lọc nhanh mã đơn / khách hàng..." />
            </form>
            <div className="orders-view-toggle" aria-label="Kiểu hiển thị">
              <button className={viewMode === 'cards' ? 'active' : ''} onClick={() => changeView('cards')} title="Dạng thẻ"><LayoutGrid size={16} /></button>
              <button className={viewMode === 'table' ? 'active' : ''} onClick={() => changeView('table')} title="Dạng bảng"><Table2 size={16} /></button>
            </div>
          </div>
        </div>

        {error && <div className="orders-error">{error}</div>}
        {loading ? <div className="orders-empty">Đang tải đơn hàng…</div> : !visibleOrders.length ? <div className="orders-empty"><Package size={40} />Không có đơn phù hợp</div> : viewMode === 'cards' ? renderCards() : <>
          <div className="orders-table-view"><table><thead><tr><th>Số CT</th><th>Khách hàng</th><th>Giờ tạo</th><th>Trạng thái</th><th>Xuất kho</th><th className="money-col">Tổng tiền</th><th>Thao tác</th></tr></thead><tbody>
            {visibleOrders.map(order => { const t = resolveTotals(order); return <tr key={order.so_ct} className={newIds.has(order.so_ct) ? 'is-new' : ''}>
              <td><span className="order-number">{order.so_ct}</span>{newIds.has(order.so_ct) && <span className="new-badge">MỚI</span>}</td><td><strong>{order.ten_kh}</strong><small>{order.ma_kh}</small></td><td><strong className="created-time">{orderCreatedAt(order)}</strong><small>Ngày CT: {date(order.ngay_ct)}</small></td><td><span className={`status status-${String(order.status)}`}>{order.status_text}</span></td><td>{order.da_xuat ? 'Đã xuất' : 'Chưa xuất'}</td><td className="money-col"><strong>{money(t.coThue ? t.sau : t.truoc)} đ</strong></td><td><div className="table-actions"><button onClick={event => copyOrderCode(event, order.so_ct)} title="Sao chép"><Copy size={14} /></button><button className="primary" onClick={() => openDetail(order.so_ct)}><Eye size={14} /> Chi tiết</button></div></td>
            </tr> })}
          </tbody></table></div>
          {renderCards('orders-mobile-fallback')}
        </>}
        <div className="orders-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trang trước</button><span>{page} / {maxPage}</span><button disabled={page >= maxPage} onClick={() => setPage(p => p + 1)}>Trang sau →</button></div>
      </section>

      {selected && <div className="order-drawer-backdrop" onClick={() => setSelected(null)}><aside className="order-drawer" onClick={e => e.stopPropagation()}>
        <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Đóng"><X /></button>
        {detailLoading ? <div className="orders-empty">Đang tải chi tiết…</div> : <OrderDetail data={selected} />}
      </aside></div>}
    </main>
  )
}

function OrderDetail({ data }) {
  const order = data.phieu_to2 || {}
  const items = data.chi_tiet || []
  const exportInfo = data.phieu_xuat || {}
  const t = resolveTotals(order)
  const tongDong = Number(data.tong_so_dong ?? items.length)

  const [itemQuery, setItemQuery] = useState('')
  const [itemPage, setItemPage] = useState(1)

  const filtered = useMemo(() => {
    const q = itemQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter(it =>
      String(it.ten_vt || '').toLowerCase().includes(q) ||
      String(it.ma_vt || '').toLowerCase().includes(q)
    )
  }, [items, itemQuery])

  const totalItemPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE_DETAIL))
  const safeItemPage = Math.min(itemPage, totalItemPages)
  const visible = filtered.slice((safeItemPage - 1) * PAGE_SIZE_DETAIL, safeItemPage * PAGE_SIZE_DETAIL)

  useEffect(() => { setItemPage(1) }, [itemQuery])

  const sumVisibleTruoc = visible.reduce((s, it) => s + lineAmounts(it).truoc, 0)
  const sumVisibleSau = visible.reduce((s, it) => s + lineAmounts(it).sau, 0)

  return <div className="drawer-content">
    <span className="orders-eyebrow">CHI TIẾT ĐƠN HÀNG</span>
    <h2>{order.so_ct}</h2>

    <div className="drawer-customer">
      <UserRound />
      <div>
        <small>Khách hàng</small>
        <strong>{order.ten_kh}</strong>
        <span>{order.ma_kh}{order.ma_so_thue ? ` · MST ${order.ma_so_thue}` : ''}</span>
        {order.dia_chi_gh && <span className="drawer-addr">{order.dia_chi_gh}</span>}
      </div>
    </div>

    <div className="drawer-facts">
      <div><small>Thời gian tạo đơn</small><strong>{orderCreatedAt(order)}</strong></div>
      <div><small>Ngày chứng từ</small><strong>{date(order.ngay_ct)}</strong></div>
      <div><small>Trạng thái</small><strong>{order.status_text}</strong></div>
      <div><small>Tổng số lượng</small><strong>{money(order.tong_so_luong)}</strong></div>
      <div><small>Số dòng hàng</small><strong>{money(tongDong)}</strong></div>
    </div>

    <div className="drawer-totals">
      <div className="drawer-total-row">
        <span>Tiền trước thuế</span>
        <strong>{money(t.truoc)} đ</strong>
      </div>
      {t.coThue && (
        <div className="drawer-total-row">
          <span>Thuế VAT</span>
          <strong className="tax">{money(t.thue)} đ</strong>
        </div>
      )}
      <div className="drawer-total-row grand">
        <span>Tổng sau thuế</span>
        <strong>{money(t.sau)} đ</strong>
      </div>
    </div>

    <div className={`drawer-export ${exportInfo.co_phieu ? 'done' : ''}`}>
      {exportInfo.co_phieu ? `✓ Đã xuất kho · ${exportInfo.so_ct_hda || ''}` : '○ Chưa xuất kho'}
    </div>

    <div className="drawer-items-header">
      <h3><FileText size={16} /> Hàng hóa <span>{items.length}</span></h3>
      {items.length > PAGE_SIZE_DETAIL && (
        <div className="drawer-items-search">
          <Search size={14} />
          <input value={itemQuery} onChange={e => setItemQuery(e.target.value)} placeholder="Lọc mã / tên hàng..." />
        </div>
      )}
    </div>

    {items.length > PAGE_SIZE_DETAIL && (
      <div className="drawer-items-meta">
        Hiển thị {((safeItemPage - 1) * PAGE_SIZE_DETAIL) + 1}–{Math.min(safeItemPage * PAGE_SIZE_DETAIL, filtered.length)} / {filtered.length} dòng
        {filtered.length > 0 && (
          <span className="drawer-items-sum">· Trang này: {money(sumVisibleTruoc)} → {money(sumVisibleSau)} đ</span>
        )}
      </div>
    )}

    <div className="drawer-items">
      {visible.length === 0 && <div className="drawer-items-empty">Không có dòng hàng phù hợp</div>}
      {visible.map((item, i) => {
        const a = lineAmounts(item)
        const idx = (safeItemPage - 1) * PAGE_SIZE_DETAIL + i + 1
        return (
          <div key={`${item.ma_vt}-${item.ln ?? i}`} className="drawer-item">
            <b>{String(idx).padStart(3, '0')}</b>
            <span className="drawer-item-info">
              <strong>{item.ten_vt || item.ma_vt}</strong>
              <small>
                {item.ma_vt} · {money(item.so_luong)} {item.dvt}
                {a.thueSuat > 0 && <> · <em className="rate">{a.thueSuat}%</em></>}
              </small>
            </span>
            <span className="drawer-item-money">
              <em>{money(a.truoc)} đ</em>
              {t.coThue && a.thue > 0 && <small>+{money(a.thue)} VAT</small>}
              {t.coThue && a.sau !== a.truoc && <strong>{money(a.sau)} đ</strong>}
            </span>
          </div>
        )
      })}
    </div>

    {totalItemPages > 1 && (
      <div className="drawer-pagination">
        <button disabled={safeItemPage <= 1} onClick={() => setItemPage(p => Math.max(1, p - 1))}>
          <ChevronLeft size={15} /> Trước
        </button>
        <span>Trang {safeItemPage} / {totalItemPages}</span>
        <button disabled={safeItemPage >= totalItemPages} onClick={() => setItemPage(p => Math.min(totalItemPages, p + 1))}>
          Sau <ChevronRight size={15} />
        </button>
      </div>
    )}

    {order.dien_giai && <div className="drawer-note">📝 {order.dien_giai}</div>}
  </div>
}
