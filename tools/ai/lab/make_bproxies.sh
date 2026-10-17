#!/bin/bash
# per-building proxies (single views 0..180 step 15) + a 13-view sheet (5x3, 384 px cells) for each simple reference building
cd "$(dirname "$0")"; I=~/ComfyUI/input; PY=~/ComfyUI/.venv/bin/python
mk() { # tag roof axis L D floors fh ridge
  local tag=$1 roof=$2 axis=$3; shift 3
  for a in $(seq 0 15 180); do PL=$1 PD=$2 PFL=$3 PFH=$4 PRIDGE=$5 PAXIS=$axis PTAG=_$tag $PY proxy2.py $I $a $roof iso tall >/dev/null; done
  local stem="p{a}_iso_t_$tag"; [ "$roof" != "hip" ] && stem="p{a}_${roof}_iso_t_$tag"
  PAT="$stem" $PY sheet_proxy.py $I sheet13_$tag 5 384 $(seq 0 15 180)
}
mk izba gable n 8 7 1 3.0 3.5
mk thatched gable u 12 6 1 3.2 4.0
mk halftimber gable n 9 9 3 3.0 5.0
mk canal gable n 7 13 4 3.2 4.5
mk khrush flat u 48 12 5 2.8 0.5
mk painted gable n 8 14 3 3.4 4.0
