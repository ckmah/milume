import sys,os
from multiprocessing import Pool
from herolib import render
def go(i):
    p=f"render/frames/f{i:04d}.png"
    if not os.path.exists(p): render(i/30.0).save(p,compress_level=1)
if __name__=="__main__":
    with Pool(8) as pl: pl.map(go,range(330),chunksize=2)
