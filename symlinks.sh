#!/usr/bin/env bash

for d in `ls -d */`;
do
    ( stow --adopt --restow $d  -v -t $HOME)
done
