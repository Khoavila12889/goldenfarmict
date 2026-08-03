/**
 * ImageLightbox.jsx
 * ─────────────────────────────────────────────────────────────────
 * Trình xem ảnh toàn màn hình chuyên nghiệp, dùng thư viện
 * `yet-another-react-lightbox` (đã có trong package.json).
 *
 * Props:
 *   open         boolean      – bật/tắt lightbox
 *   onClose      () => void   – callback khi đóng
 *   slides       Array<{src, downloadUrl?, alt?, title?, description?, thumbnail?}>
 *   index        number       – index ảnh hiện tại khi mở
 *
 * Plugins kích hoạt: Zoom, Slideshow, Thumbnails, Captions
 * Hỗ trợ: Arrow keys, Swipe on mobile, ESC để đóng.
 */

import React from 'react'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Captions from 'yet-another-react-lightbox/plugins/captions'
import { Download } from 'lucide-react'

// Core CSS (bắt buộc)
import 'yet-another-react-lightbox/styles.css'
// Plugin CSS
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import 'yet-another-react-lightbox/plugins/captions.css'

export default function ImageLightbox({ open, onClose, slides = [], index = 0 }) {
  if (!open || slides.length === 0) return null

  const handleDownload = async (slide) => {
    if (!slide) return
    const primaryUrl = slide.downloadUrl || slide.src
    if (!primaryUrl) return

    const fileName = slide.title || slide.alt || 'image'

    const triggerSave = (blob) => {
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    }

    try {
      const res = await fetch(primaryUrl)
      if (!res.ok) throw new Error('Download primary error: ' + res.status)
      const blob = await res.blob()
      triggerSave(blob)
    } catch (err) {
      // Fallback: nếu gọi downloadUrl lỗi (vd: HTTP 502), tải trực tiếp từ slide.src (API thumbnail chất lượng cao)
      if (slide.src && slide.src !== primaryUrl) {
        try {
          const resFallback = await fetch(slide.src)
          if (resFallback.ok) {
            const blobFallback = await resFallback.blob()
            triggerSave(blobFallback)
            return
          }
        } catch (_) {}
      }
      alert('Tải file thất bại: Không thể tải được dữ liệu ảnh.')
    }
  }

  return (
    <Lightbox
      open={open}
      close={onClose}
      slides={slides}
      index={index}
      plugins={[Zoom, Slideshow, Thumbnails, Captions]}

      // ── Toolbar & Custom Buttons ─────────────────────────────────
      toolbar={{
        buttons: [
          ({ slide }) => (
            <button
              type="button"
              className="yarl__button"
              title="Tải xuống"
              onClick={() => handleDownload(slide)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}
            >
              <Download size={20} color="#fff" />
            </button>
          ),
          'close',
        ],
      }}

      // ── Zoom settings ────────────────────────────────────────────
      zoom={{
        maxZoomPixelRatio: 5,
        zoomInMultiplier: 1.5,
        doubleTapDelay: 300,
        doubleClickDelay: 300,
        doubleClickMaxStops: 2,
        keyboardMoveDistance: 50,
        wheelZoomDistanceFactor: 100,
        pinchZoomDistanceFactor: 100,
        scrollToZoom: true,
      }}

      // ── Slideshow settings ───────────────────────────────────────
      slideshow={{
        autoplay: false,
        delay: 3500,
      }}

      // ── Thumbnails settings ──────────────────────────────────────
      thumbnails={{
        position: 'bottom',
        width: 80,
        height: 60,
        border: 2,
        borderRadius: 6,
        padding: 3,
        gap: 8,
        imageFit: 'cover',
        vignette: true,
      }}

      // ── Captions settings ────────────────────────────────────────
      captions={{
        showToggle: true,
        descriptionTextAlign: 'center',
        descriptionMaxLines: 2,
      }}

      // ── Carousel ─────────────────────────────────────────────────
      carousel={{
        finite: false,
        preload: 2,
        padding: 0,
        spacing: '10%',
        imageFit: 'contain',
      }}

      // ── Animation ────────────────────────────────────────────────
      animation={{ fade: 250, swipe: 300 }}

      // ── Controller ───────────────────────────────────────────────
      controller={{
        closeOnBackdropClick: true,
        closeOnPullUp: true,
        closeOnPullDown: true,
      }}

      // ── Custom styles ─────────────────────────────────────────────
      styles={{
        container: {
          backgroundColor: 'rgba(5, 5, 15, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        },
        root: {
          '--yarl__color_backdrop': 'rgba(5, 5, 15, 0.96)',
          '--yarl__slide_title_color': '#f1f5f9',
          '--yarl__slide_description_color': '#94a3b8',
          '--yarl__thumbnails_thumbnail_border_color': 'transparent',
          '--yarl__thumbnails_thumbnail_active_border_color': '#3b82f6',
          '--yarl__button_filter': 'brightness(0.9)',
          '--yarl__button_disabled_filter': 'brightness(0.4)',
        },
      }}
    />
  )
}

