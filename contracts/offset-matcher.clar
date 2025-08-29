;; OffsetMatcher.clar
;; Core contract for matching flight emissions to reforestation credits in GreenFlight Offsets
;; Handles automatic and manual matching, verification, and integration with other system contracts

;; Traits for inter-contract communication
(define-trait flight-registry-trait
  (
    (get-flight-emissions (uint) (response uint uint))
    (is-flight-registered (uint) (response bool uint))
  )
)

(define-trait reforestation-registry-trait
  (
    (get-project-credits (uint) (response uint uint))
    (deduct-project-credits (uint uint) (response bool uint))
    (is-project-verified (uint) (response bool uint))
  )
)

(define-trait emission-calculator-trait
  (
    (calculate-emissions (uint uint uint) (response uint uint)) ;; Simplified: distance, aircraft-type, passengers
  )
)

(define-trait carbon-token-trait
  (
    (mint-tokens (uint principal (string-utf8 256)) (response bool uint))
    (retire-tokens (uint principal) (response bool uint))
  )
)

(define-trait governance-trait
  (
    (has-permission (principal (string-ascii 32)) (response bool uint))
  )
)

;; Constants
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INVALID-FLIGHT u101)
(define-constant ERR-INVALID-PROJECT u102)
(define-constant ERR-INSUFFICIENT-CREDITS u103)
(define-constant ERR-ALREADY-MATCHED u104)
(define-constant ERR-PAUSED u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-MATCH-FAILED u107)
(define-constant ERR-INVALID-MODE u108)
(define-constant ERR-METADATA-TOO-LONG u109)
(define-constant ERR-NO-PENDING-MATCH u110)
(define-constant ERR-GOVERNANCE u111)
(define-constant MAX-METADATA-LEN u500)
(define-constant AUTO-MATCH u1)
(define-constant MANUAL-MATCH u2)

;; Data Variables
(define-data-var contract-owner principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var match-fee uint u100) ;; In micro-STX
(define-data-var auto-match-threshold uint u1000) ;; Minimum credits for auto-match
(define-data-var flight-registry-contract principal 'SP000000000000000000002Q6VF78.flight-registry) ;; Placeholder
(define-data-var reforestation-registry-contract principal 'SP000000000000000000002Q6VF78.reforestation-registry) ;; Placeholder
(define-data-var emission-calculator-contract principal 'SP000000000000000000002Q6VF78.emission-calculator) ;; Placeholder
(define-data-var carbon-token-contract principal 'SP000000000000000000002Q6VF78.carbon-token) ;; Placeholder
(define-data-var governance-contract principal 'SP000000000000000000002Q6VF78.governance) ;; Placeholder

;; Data Maps
(define-map matches
  { flight-id: uint }
  {
    project-ids: (list 10 uint),
    matched-credits: uint,
    timestamp: uint,
    matcher: principal,
    mode: uint, ;; AUTO-MATCH or MANUAL-MATCH
    metadata: (string-utf8 256),
    retired: bool
  }
)

(define-map pending-matches
  { flight-id: uint }
  {
    proposed-project-ids: (list 10 uint),
    proposed-credits: uint,
    proposer: principal,
    expiry: uint
  }
)

(define-map match-history
  { match-id: uint }
  {
    flight-id: uint,
    project-id: uint,
    credits: uint,
    timestamp: uint
  }
)

(define-map auto-match-preferences
  { user: principal }
  {
    preferred-projects: (list 5 uint),
    min-credits-per-project: uint,
    max-fee: uint
  }
)

(define-data-var match-counter uint u0)

;; Private Functions
(define-private (is-owner-or-governance (caller principal))
  (or (is-eq caller (var-get contract-owner))
      (unwrap-panic (contract-call? (as-contract (var-get governance-contract)) has-permission caller "match-admin")))
)

(define-private (get-flight-emissions (flight-id uint))
  (contract-call? (as-contract (var-get flight-registry-contract)) get-flight-emissions flight-id)
)

(define-private (deduct-project-credits (project-id uint) (amount uint))
  (contract-call? (as-contract (var-get reforestation-registry-contract)) deduct-project-credits project-id amount)
)

(define-private (is-project-verified (project-id uint))
  (contract-call? (as-contract (var-get reforestation-registry-contract)) is-project-verified project-id)
)

(define-private (mint-carbon-tokens (amount uint) (recipient principal) (metadata (string-utf8 256)))
  (contract-call? (as-contract (var-get carbon-token-contract)) mint-tokens amount recipient metadata)
)

(define-private (retire-carbon-tokens (amount uint) (owner principal))
  (contract-call? (as-contract (var-get carbon-token-contract)) retire-tokens amount owner)
)

(define-private (perform-match (flight-id uint) (project-ids (list 10 uint)) (mode uint) (metadata (string-utf8 256)))
  (let
    (
      (emissions (unwrap-panic (get-flight-emissions flight-id)))
      (total-credits (fold sum-project-credits project-ids u0))
    )
    (if (or (var-get is-paused) (> (len metadata) MAX-METADATA-LEN))
      (err ERR-PAUSED)
      (if (>= total-credits emissions)
        (begin
          (try! (fold deduct-credits project-ids (ok u0)))
          (map-set matches {flight-id: flight-id}
            {
              project-ids: project-ids,
              matched-credits: total-credits,
              timestamp: block-height,
              matcher: tx-sender,
              mode: mode,
              metadata: metadata,
              retired: false
            }
          )
          (try! (mint-carbon-tokens total-credits tx-sender metadata))
          (var-set match-counter (+ (var-get match-counter) u1))
          (print {event: "match-created", flight-id: flight-id, projects: project-ids, credits: total-credits})
          (ok true)
        )
        (err ERR-INSUFFICIENT-CREDITS)
      )
    )
  )
)

(define-private (sum-project-credits (project-id uint) (acc uint))
  (+ acc (unwrap-panic (contract-call? (as-contract (var-get reforestation-registry-contract)) get-project-credits project-id)))
)

(define-private (deduct-credits (project-id uint) (acc (response uint uint)))
  (let ((credits (unwrap-panic (contract-call? (as-contract (var-get reforestation-registry-contract)) get-project-credits project-id))))
    (try! (deduct-project-credits project-id credits))
    (ok (+ (unwrap-panic acc) credits))
  )
)

;; Public Functions
(define-public (auto-match (flight-id uint) (metadata (string-utf8 256)))
  (let
    (
      (prefs (unwrap! (map-get? auto-match-preferences {user: tx-sender}) (err ERR-NO-PENDING-MATCH)))
      (project-ids (get preferred-projects prefs))
    )
    (if (and (unwrap-panic (contract-call? (as-contract (var-get flight-registry-contract)) is-flight-registered flight-id))
             (not (is-some (map-get? matches {flight-id: flight-id}))))
      (perform-match flight-id project-ids AUTO-MATCH metadata)
      (err ERR-INVALID-FLIGHT)
    )
  )
)

(define-public (manual-match (flight-id uint) (project-ids (list 10 uint)) (metadata (string-utf8 256)))
  (if (and (unwrap-panic (contract-call? (as-contract (var-get flight-registry-contract)) is-flight-registered flight-id))
           (not (is-some (map-get? matches {flight-id: flight-id})))
           (fold check-project-verified project-ids true))
    (perform-match flight-id project-ids MANUAL-MATCH metadata)
    (err ERR-INVALID-PROJECT)
  )
)

(define-public (propose-pending-match (flight-id uint) (project-ids (list 10 uint)) (expiry uint))
  (if (not (is-some (map-get? matches {flight-id: flight-id})))
    (begin
      (map-set pending-matches {flight-id: flight-id}
        {
          proposed-project-ids: project-ids,
          proposed-credits: (fold sum-project-credits project-ids u0),
          proposer: tx-sender,
          expiry: (+ block-height expiry)
        }
      )
      (print {event: "pending-match-proposed", flight-id: flight-id, projects: project-ids})
      (ok true)
    )
    (err ERR-ALREADY-MATCHED)
  )
)

(define-public (approve-pending-match (flight-id uint) (metadata (string-utf8 256)))
  (let
    (
      (pending (unwrap! (map-get? pending-matches {flight-id: flight-id}) (err ERR-NO-PENDING-MATCH)))
    )
    (if (and (is-eq tx-sender (unwrap-panic (map-get? ip-registry {hash: (get work-hash pending)}))) ;; Wait, adapt to flight owner
             (<= block-height (get expiry pending)))
      (begin
        (try! (perform-match flight-id (get proposed-project-ids pending) MANUAL-MATCH metadata))
        (map-delete pending-matches {flight-id: flight-id})
        (ok true)
      )
      (err ERR-UNAUTHORIZED)
    )
  )
)

(define-public (retire-match (flight-id uint))
  (let
    (
      (match (unwrap! (map-get? matches {flight-id: flight-id}) (err ERR-INVALID-FLIGHT)))
    )
    (if (is-eq tx-sender (get matcher match))
      (begin
        (try! (retire-carbon-tokens (get matched-credits match) tx-sender))
        (map-set matches {flight-id: flight-id} (merge match {retired: true}))
        (print {event: "match-retired", flight-id: flight-id, credits: (get matched-credits match)})
        (ok true)
      )
      (err ERR-UNAUTHORIZED)
    )
  )
)

(define-public (set-auto-match-preference (preferred-projects (list 5 uint)) (min-credits-per-project uint) (max-fee uint))
  (begin
    (map-set auto-match-preferences {user: tx-sender}
      {
        preferred-projects: preferred-projects,
        min-credits-per-project: min-credits-per-project,
        max-fee: max-fee
      }
    )
    (ok true)
  )
)

(define-public (pause-contract)
  (if (is-owner-or-governance tx-sender)
    (begin
      (var-set is-paused true)
      (ok true)
    )
    (err ERR_UNAUTHORIZED)
  )
)

(define-public (unpause-contract)
  (if (is-owner-or-governance tx-sender)
    (begin
      (var-set is-paused false)
      (ok true)
    )
    (err ERR_UNAUTHORIZED)
  )
)

(define-public (set-match-fee (new-fee uint))
  (if (is-owner-or-governance tx-sender)
    (begin
      (var-set match-fee new-fee)
      (ok true)
    )
    (err ERR_UNAUTHORIZED)
  )
)

(define-public (set-auto-match-threshold (new-threshold uint))
  (if (is-owner-or-governance tx-sender)
    (begin
      (var-set auto-match-threshold new-threshold)
      (ok true)
    )
    (err ERR_UNAUTHORIZED)
  )
)

(define-public (update-contract-references (flight-reg principal) (reforest-reg principal) (emission-calc principal) (carbon-tok principal) (gov principal))
  (if (is-owner-or-governance tx-sender)
    (begin
      (var-set flight-registry-contract flight-reg)
      (var-set reforestation-registry-contract reforest-reg)
      (var-set emission-calculator-contract emission-calc)
      (var-set carbon-token-contract carbon-tok)
      (var-set governance-contract gov)
      (ok true)
    )
    (err ERR_UNAUTHORIZED)
  )
)

;; Read-Only Functions
(define-read-only (get-match-details (flight-id uint))
  (map-get? matches {flight-id: flight-id})
)

(define-read-only (get-pending-match (flight-id uint))
  (map-get? pending-matches {flight-id: flight-id})
)

(define-read-only (get-auto-preference (user principal))
  (map-get? auto-match-preferences {user: user})
)

(define-read-only (get-contract-state)
  {
    owner: (var-get contract-owner),
    paused: (var-get is-paused),
    fee: (var-get match-fee),
    threshold: (var-get auto-match-threshold)
  }
)

(define-read-only (check-project-verified (project-id uint) (acc bool))
  (and acc (unwrap-panic (is-project-verified project-id)))
)

