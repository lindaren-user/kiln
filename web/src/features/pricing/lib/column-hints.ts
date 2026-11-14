/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * How the model square derives each column. The English text is also the key in
 * the locale files, so callers pass it through t().
 */

export const AVERAGE_LATENCY_HINT =
  'Range: the most recent 24 hours that have data, up to 7 days back. Average time from request start to completion; streaming responses are timed until the stream ends, and async image or video tasks count their full run time.'

/** Also used by the card badge, which shows the same metric. */
export const SUCCESS_RATE_HINT =
  'Range: the most recent 24 hours that have data, up to 7 days back, including the current partial hour. Success rate is successful requests divided by counted requests; business rejections (insufficient balance, blocked content, invalid requests) and cancellations are not counted.'

export const PRICE_HINT =
  'List price per unit for the selected group, including its group ratio. With the recharge display mode on, it also applies the recharge rate. Tiered or time-based models list every tier.'
