#!/bin/sh
# Fetch the kelurahan polygons that `pnpm data:enrich` reads.
#
# Source: cahyadsn/wilayah_boundaries (MIT; geometry derived from BIG, codes
# from Kemendagri). The files are not committed because they are 14 MB of
# derived data; this script reproduces them.
#
# The set covers the networks the app carries: DKI Jakarta, the Bogor,
# Depok and Bekasi kabupaten/kota, Tangerang, and the KRL lines that reach
# Lebak, Serang, Karawang and Purwakarta.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
dir="$root/data/admin"
base="https://raw.githubusercontent.com/cahyadsn/wilayah_boundaries/master/db"
mkdir -p "$dir"

fetch() {
  url=$1
  target=$2
  if [ -s "$target" ]; then
    echo "· $(basename "$target")"
    return
  fi
  echo "→ $(basename "$target")"
  curl -fsSL --retry 3 -o "$target" "$url"
}

# Provinces: names for the top level.
for i in 1 2 3 4 5 6 7 8; do
  fetch "$base/prov/wilayah_boundaries_prov_$i.sql" "$dir/prov_$i.sql"
done

# Kabupaten/kota and kecamatan names, per province.
for code in 31 32 36; do
  fetch "$base/kab/wilayah_boundaries_kab_$code.sql" "$dir/kab_$code.sql"
  fetch "$base/kec/wilayah_boundaries_kec_$code.sql" "$dir/kec_$code.sql"
done

# Kelurahan polygons, per kabupaten/kota.
for code in \
  31.01 31.71 31.72 31.73 31.74 31.75 \
  32.01 32.02 32.14 32.15 32.16 32.71 32.75 32.76 \
  36.02 36.03 36.04 36.71 36.74
do
  province=${code%%.*}
  fetch "$base/kel/$province/wilayah_boundaries_kel_$code.sql" "$dir/kel_$code.sql"
done

echo "✓ boundaries in $dir"
