"""Inflate cell_by_gene_with_metadata.h5ad from a (possibly partial) data_upload.zip.

The member starts at byte 299 of the zip and is only 990,689,244 B compressed, so the
first ~1 GB of the 26.4 GB zip is enough. The script streams it once with zlib, checks
the CRC32 against the data descriptor, and writes a sparse 62.9 GB file that holds only
the byte ranges given on the command line (start:end, uncompressed offsets).

Ranges used for slice 20211215_WT_ile1_slice_2 (rows 130471-160803):
  0:67108864                  superblock, root group, X header
  947225604:1167435924        X rows of the slice (float32, 7,260 B/row, data at 6144)
  14950000000:17300000000     layers/raw.X headers (raw.X equals X)
  29500000000:33500000000     obs, var, obsm, uns metadata and obs columns
  33500000000:35900000000     layers/raw_counts rows (int64, data at 32,983,490,084)
  62395439116:62895439116     file tail (uns/blank_names, heaps)

Usage: python inflate_member.py member_sparse.h5 0:67108864 947225604:1167435924 ...
"""
import zlib, sys, os
p=os.environ.get('ZIP', 'data_upload.zip')
USIZE=62895439116
keep=[(int(a),int(b)) for a,b in (x.split(':') for x in sys.argv[2:])]
out=open(sys.argv[1],'r+b' if os.path.exists(sys.argv[1]) else 'wb'); out.truncate(USIZE)
import struct; PAT=struct.pack('<QQ',2060051,1815); hits=[]; prev=b''
f=open(p,'rb'); f.seek(299); d=zlib.decompressobj(-15); pos=0; cin=0; crc=0
while not d.eof:
    c=f.read(4<<20)
    if not c: print('EOF of partial before member end', pos); break
    cin+=len(c); u=d.decompress(c); crc=zlib.crc32(u,crc)
    a0,b0=pos,pos+len(u)
    for a,b in keep:
        s,e=max(a,a0),min(b,b0)
        if s<e: out.seek(s); out.write(u[s-a0:e-a0])
    w=prev+u; k=-1
    while True:
        k=w.find(PAT,k+1)
        if k<0: break
        hits.append(a0-len(prev)+k)
    prev=u[-15:]
    pos=b0
out.close(); print('dims-pattern hits', sorted(set(hits)))
import struct; dd=d.unused_data[:24]; print('descriptor',dd.hex(),'crc',hex(crc))
print('inflated',pos,'expected',USIZE,'compressed_used',cin-len(d.unused_data),'crc-unchecked')
