# Norgesgruppen Data
Task for finding and classifying groceries in shelves.

# Setup
Create a `data` folder. Create a subfolder called `product_images`. Unzip the training data inside `data`, unzip the product images inside `product_images`. Final structure should be

```
.
├── data
├── product_images
│   ├── 4521
│   │   ├── main.jpg
│   ├── 42070436
│   │   ├── back.jpg
│   │   ├── bottom.jpg
│   │   ├── front.jpg
│   │   ├── ...
│   ├── ...
│   └── metadata.json
├── train
│   ├── images
│   │   ├── img_00001.jpg
│   │   ├── img_00002.jpg
│   │   ├── ...
│   └── annotations.json
```