/* global Chart */

'use strict';

var Graph = function(canvas) {
  let adaChart;
  
  this.chart = canvas.getContext('2d');
  this.maxBufferSize = 64
  this.showLegend = true;
  
  this.XTConfig = {
    type: 'line', // make it a line chart
    data: {
      labels: [],
      datasets: []
    },
    options: {
      elements: {
        line: {
          tension: 0,
          fill: false
        },
      },
      animation: {
        duration: 0
      },
      hover: {
        enabled: false
      },
      tooltips: {
        enabled: false
      },
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        xAxes: [{
          type: 'time',
          bounds: 'data',
          distribution: 'series',
          gridLines: {
            drawOnChartArea: false,
          },
          ticks: {
            display: false,
          },
        }],
        yAxes: [{
          ticks: {
            maxRotation: 0
          }
        }]
      },
    }
  };
}

Graph.prototype = {
  create: function (showLegend) {  
    if (showLegend === false) {
      this.showLegend = false;
    }

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
    
    if (!this.showLegend) {
      config.options.legend = {display: false};
    }

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
      borderWidth: 1,
      pointRadius: 0
    }
    this.adaChart.data.datasets.push(dataConfig);
  },
  update: function() {
    this.adaChart.update();
  },
  addValue: function(dataSetIndex, value, autoFlush) {
    if (autoFlush === undefined) {
      autoFlush = true;
    }
    let time = new Date();
    this.adaChart.data.datasets[dataSetIndex].data.push({
      t: time,
      y: value
    });
    if (autoFlush) {
      this.flushBuffer();
    }
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
          dataset.data.shift()
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
