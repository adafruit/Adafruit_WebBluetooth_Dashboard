/* global Chart */

'use strict';

var Graph = function(canvas) {
  let adaChart;

  this.chart = canvas.getContext('2d');
  this.maxBufferSize = 64

  this.XTConfig = {
    type: 'line', // make it a line chart
    data: {
      labels: [],
      datasets: []
    },
    options: {
      animation: {
        duration: 0
      },
      elements: {
        line: {
          fill: false
        },
      },
      hover: {
        enabled: false
      },
      layout: {
        padding: {
          top: 6,
          bottom: 6,
          right: 30
        }
      },
      legend: {
        display: false
      },
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        xAxes: [{
          type: 'time',
          bounds: 'data',
          distribution: 'series',
          display: false,
          gridLines: {
            display:false,
          },
        }],
        yAxes: [{
          display: false,
          gridLines: {
            display:false
          },
        }]
      },
      tooltips: {
        enabled: false
      },
    }
  };
}

Graph.prototype = {
  create: function () {
    // Remove any existing chart
    if (this.adaChart != undefined) {
      this.adaChart.destroy();
      delete this.adaChart;
    }
    let config = this.getConfig();
    this.adaChart = new Chart(this.chart, config);
  },
  getConfig: function() {
    let config = this.XTConfig;
    return config;
  },
  updateLabelColor: function(color) {
    this.adaChart.options.scales.xAxes[0].ticks.fontColor = color;
    this.adaChart.options.scales.yAxes[0].ticks.fontColor = color;
    this.adaChart.update();
  },
  reset: function() {
    // Clear the data
    let dataSetLength = this.adaChart.data.datasets.length;
    for(let i = 0; i < dataSetLength; i++) {
      this.adaChart.data.datasets.pop();
    }
    this.adaChart.update();
  },
  clear: function() {
    // Clear the data
    let dataSetLength = this.adaChart.data.datasets.length;
    for(let i = 0; i < dataSetLength; i++) {
      this.adaChart.data.datasets[i].data = [];
    }
    this.adaChart.update();
  },
  addDataSet: function(label, color) {
    let dataConfig = {
      label: label,
      data: [],
      borderColor: color,
      borderWidth: 2,
      pointRadius: 0
    }
    this.adaChart.data.datasets.push(dataConfig);
  },
  update: function() {
    this.adaChart.update();
  },
  addValue: function(datasetIndex, value, autoFlush) {
    let dataset = this.adaChart.data.datasets[datasetIndex];
    if (autoFlush === undefined) {
      autoFlush = true;
    }
    let time = new Date();
    dataset.data.push({
      t: time,
      y: value
    });
    dataset.pointRadius = this.pointRadiusLast(5, dataset.data.length);
    if (autoFlush) {
      this.flushBuffer();
    }
  },
  pointRadiusLast: function (radius, length, initialArray) {
    let result = initialArray || [ radius ];
    while (result.length < length) result.unshift(0); // Place zeros in front
    return result;
  },
  clearValues: function(dataSetIndex) {
    if (dataSetIndex !== undefined) {
      this.adaChart.data.datasets[dataSetIndex].data = [];
    }
  },
  flushBuffer: function() {
    // Make sure to shift out old data
    this.adaChart.data.datasets.forEach(
      dataset => {
        if (dataset.data.length > this.maxBufferSize) {
          dataset.data.shift();
          dataset.pointRadius = this.pointRadiusLast(5, dataset.data.length);
        }
      }
    )
    this.update();
  },
  dataset: function(dataSetIndex) {
    return this.adaChart.data.datasets[dataSetIndex];
  },
  setBufferSize: function(size) {
    this.maxBufferSize = size;
  }
}
