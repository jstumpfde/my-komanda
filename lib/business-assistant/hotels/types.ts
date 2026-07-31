export interface HotelSearchParams {
  cityIata:  string
  checkIn:   string
  checkOut:  string
  adults:    number
}

export interface HotelOffer {
  id:           string
  name:         string
  stars:        number
  ratingLabel:  string | null
  priceRub:     number
  nights:       number
  deepLink:     string
}
