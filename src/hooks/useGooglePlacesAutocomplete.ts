'use client'

import { useEffect, useRef, useState } from 'react'

interface AddressComponents {
  streetAddress: string
  city: string
  state: string
  zip: string
}

interface UseGooglePlacesAutocompleteOptions {
  inputRef: React.RefObject<HTMLInputElement | null>
  onSelect: (components: AddressComponents) => void
  enabled?: boolean
}

// Augment Window so TypeScript knows about the runtime google global
declare global {
  interface Window {
    google?: typeof google
  }
}

/**
 * Attaches a Google Places Autocomplete instance to the given input ref.
 * Falls back gracefully if the API key is missing or the script hasn't loaded.
 */
export function useGooglePlacesAutocomplete({
  inputRef,
  onSelect,
  enabled = true,
}: UseGooglePlacesAutocompleteOptions) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [apiReady, setApiReady] = useState(false)

  // Poll for the google.maps.places namespace (loaded via <Script> in the component)
  useEffect(() => {
    if (!enabled) return

    let attempts = 0
    const MAX_ATTEMPTS = 40 // 4s total
    const interval = setInterval(() => {
      attempts++
      if (
        typeof window !== 'undefined' &&
        window.google?.maps?.places?.Autocomplete
      ) {
        clearInterval(interval)
        setApiReady(true)
      } else if (attempts >= MAX_ATTEMPTS) {
        clearInterval(interval)
        // Give up — fall back to plain inputs
      }
    }, 100)

    return () => clearInterval(interval)
  }, [enabled])

  useEffect(() => {
    if (!apiReady || !inputRef.current) return

    try {
      const autocomplete = new google.maps.places.Autocomplete(
        inputRef.current,
        { types: ['address'], componentRestrictions: { country: 'us' } },
      )

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (!place.address_components) return

        let streetNumber = ''
        let route = ''
        let city = ''
        let state = ''
        let zip = ''

        for (const component of place.address_components) {
          const types = component.types
          if (types.includes('street_number')) streetNumber = component.long_name
          else if (types.includes('route')) route = component.long_name
          else if (types.includes('locality')) city = component.long_name
          else if (types.includes('administrative_area_level_1')) state = component.short_name
          else if (types.includes('postal_code')) zip = component.long_name
        }

        onSelect({
          streetAddress: [streetNumber, route].filter(Boolean).join(' '),
          city,
          state,
          zip,
        })
      })

      autocompleteRef.current = autocomplete
    } catch {
      // API not available — plain inputs remain functional
    }

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current)
        autocompleteRef.current = null
      }
    }
  }, [apiReady, inputRef, onSelect])

  return { apiReady }
}
