import { findZones } from '../db/repositories.js'

export const distanceMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const earthRadius = 6_371_000
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

export const findZoneId = async (latitude: number, longitude: number) => {
  const zones = await findZones()
  const containing = zones
    .map((zone) => ({ zone, distance: distanceMeters({ latitude, longitude }, { latitude: zone.latitude, longitude: zone.longitude }) }))
    .filter((item) => item.distance <= item.zone.radius_meters)
    .sort((a, b) => a.distance - b.distance)[0]
  return containing?.zone.id ?? null
}

export const locationScore = (distance: number | null) => {
  if (distance == null) return 0.7
  if (distance <= 100) return 1
  if (distance <= 300) return 0.85
  if (distance <= 700) return 0.6
  return 0.3
}

const toRad = (degree: number) => (degree * Math.PI) / 180
