// Minimal shapes for the (undocumented) Tricount/bunq registry API responses.
// Only the fields the sync actually reads are typed; everything else is ignored.
// Source of the handshake/endpoints: the Tricount Android app, mirrored by the
// community read-only client at github.com/marinoo3/TricountAPI-python.

export interface TricountAmount {
  currency: string
  value: string // decimal string, e.g. "-74.00"
}

export interface TricountMembership {
  RegistryMembershipNonUser: {
    id: number
    uuid: string
    alias: {
      display_name?: string
      pointer: {
        type: string
        value: string
        name: string
      }
    }
    status?: string
  }
}

export interface TricountAllocation {
  amount: TricountAmount
  membership: TricountMembership
}

export interface TricountRegistryEntry {
  RegistryEntry: {
    id: number
    uuid: string
    status: string // "ACTIVE" | "DELETED" | ...
    amount: TricountAmount
    exchange_rate?: string
    description: string | null
    type: string
    type_transaction: string // "NORMAL" | "BALANCE" | ...
    membership_owned?: TricountMembership
    allocations: TricountAllocation[]
    category?: string
    category_custom?: string | null
    date: string // "2026-06-07 13:33:31.295000"
  }
}

export interface TricountRegistry {
  Registry: {
    title: string
    currency: string
    memberships: TricountMembership[]
    all_registry_entry: TricountRegistryEntry[]
  }
}

// The fetched, normalized registry the sync engine consumes.
export interface FetchedRegistry {
  title: string
  currency: string
  members: { id: number; name: string }[]
  entries: TricountRegistryEntry["RegistryEntry"][]
}
