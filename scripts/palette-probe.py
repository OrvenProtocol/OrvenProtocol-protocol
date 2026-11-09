# Palette probe: k-means over opaque pixels, each centre snapped to the nearest real pixel (with its x,y).
import sys, numpy as np
from PIL import Image
from sklearn.cluster import KMeans
for f in sys.argv[1:]:
    a = np.array(Image.open(f).convert('RGB'))
    h, w, _ = a.shape
    flat = a.reshape(-1, 3)
    idx = np.random.RandomState(7).choice(len(flat), 60000, replace=False)
    km = KMeans(8, n_init=4, random_state=7).fit(flat[idx])
    cnt = np.bincount(km.labels_, minlength=8)
    print(f)
    for c, n in sorted(zip(km.cluster_centers_, cnt), key=lambda t: -t[1]):
        j = ((flat.astype(int) - c) ** 2).sum(1).argmin()
        print('  share %.3f  centre %s  snapped #%02x%02x%02x at x=%d y=%d' % (n / cnt.sum(), c.round().astype(int).tolist(), *flat[j], j % w, j // w))
