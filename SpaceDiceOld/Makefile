SASS_SOURCE = static/css/custom.scss
CSS_TARGET = static/css/custom.css

run:
	@poetry run python3 main.py


build-css:
	@sass $(SASS_SOURCE):$(CSS_TARGET) --style expanded

all: build-css run

test:
	@poetry run python3 test.py
