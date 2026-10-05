import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import type { MapPoint } from '../lib/types'

// OpenStreetMap standard tiles: no API key required.
const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function pin(color: string) {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}

export function MiniMap({ lat, lng, color }: { lat: number; lng: number; color: string }) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} dragging={false} className="h-44 w-full" attributionControl={false} zoomControl={false}>
      <TileLayer url={TILE} />
      <Marker position={[lat, lng]} icon={pin(color)} />
    </MapContainer>
  )
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))) })
  return null
}

function FitTo({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13)
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

function Recenter({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], zoom)
  }, [lat, lng, zoom, map])
  return null
}

export function LocationPicker({
  center,
  value,
  onPick,
}: {
  center: [number, number]
  value: [number, number] | null
  onPick: (lat: number, lng: number) => void
}) {
  return (
    <MapContainer center={value ?? center} zoom={13} className="h-56 w-full rounded-xl" scrollWheelZoom={false}>
      <TileLayer url={TILE} attribution={ATTRIBUTION} />
      <Recenter lat={center[0]} lng={center[1]} zoom={13} />
      <ClickToPick onPick={onPick} />
      {value && <Marker position={value} icon={pin('#c9603a')} />}
    </MapContainer>
  )
}

const URGENCY_RADIUS: Record<string, number> = { low: 7, medium: 9, high: 11, critical: 13 }

export function ProblemsMap({
  points,
  colors,
  mode,
  cityCenters,
}: {
  points: MapPoint[]
  colors: Record<string, string>
  mode: 'problems' | 'intensity'
  cityCenters: { name: string; lat: number; lng: number }[]
}) {
  const byCity = new Map<string, MapPoint[]>()
  points.forEach((p) => byCity.set(p.city, [...(byCity.get(p.city) ?? []), p]))
  const max = Math.max(1, ...[...byCity.values()].map((v) => v.length))
  return (
    <MapContainer center={[31.8, -7.2]} zoom={6} className="h-full w-full" scrollWheelZoom>
      <TileLayer url={TILE} attribution={ATTRIBUTION} />
      <FitTo points={points.map((p) => [p.lat, p.lng] as [number, number])} />
      {mode === 'problems'
        ? points.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={URGENCY_RADIUS[p.urgency] ?? 9}
              pathOptions={{ color: 'white', weight: 2, fillColor: colors[p.category] ?? '#475569', fillOpacity: 0.9 }}
            >
              <Popup>
                <div className="min-w-48">
                  <p className="text-xs font-semibold text-sand-500">
                    {p.city}
                    {p.neighborhood && ` · ${p.neighborhood}`}
                  </p>
                  <p className="mt-0.5 font-bold text-sand-900">{p.title}</p>
                  <p className="mt-1 text-xs text-sand-600">
                    {p.supporters_count} supporters · {p.solutions_count} solutions · urgency {p.urgency}
                  </p>
                  <Link to={`/problems/${p.id}`} className="mt-2 inline-block text-sm font-semibold !text-atlas-700">
                    Open problem →
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          ))
        : [...byCity.entries()].map(([city, list]) => {
            const c = cityCenters.find((x) => x.name === city) ?? { lat: list[0].lat, lng: list[0].lng }
            const ratio = list.length / max
            const color = ratio > 0.66 ? '#dc2626' : ratio > 0.33 ? '#ea580c' : '#16a34a'
            return (
              <CircleMarker key={city} center={[c.lat, c.lng]} radius={14 + ratio * 26} pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.35 }}>
                <Popup>
                  <p className="font-bold">{city}</p>
                  <p className="text-xs text-sand-600">{list.length} active problems</p>
                  <Link to={`/problems?city=${encodeURIComponent(city)}`} className="mt-1 inline-block text-sm font-semibold !text-atlas-700">
                    See problems →
                  </Link>
                </Popup>
              </CircleMarker>
            )
          })}
    </MapContainer>
  )
}
